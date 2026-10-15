#!/usr/bin/env bash
# Deploy Smorg Apps to Cloud Run (australia-southeast1).
# Usage: pnpm run deploy
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
SERVICE="${SERVICE:-smorg-apps}"
JOB="${JOB:-smorg-apps-migrate}"
AR_REPO="${AR_REPO:-smorg-apps}"

die() {
  echo "deploy: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || die "missing $file — copy .env.production.example and fill it in"
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

ensure_secret() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    die "secret $name has an empty value"
  fi
  if gcloud secrets describe "$name" --project="$GCP_PROJECT" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" \
      --project="$GCP_PROJECT" \
      --data-file=- >/dev/null
    echo "deploy: updated secret $name"
  else
    printf '%s' "$value" | gcloud secrets create "$name" \
      --project="$GCP_PROJECT" \
      --replication-policy=automatic \
      --data-file=- >/dev/null
    echo "deploy: created secret $name"
  fi
}

grant_secret_access() {
  local sa="$1"
  shift
  local name
  for name in "$@"; do
    gcloud secrets add-iam-policy-binding "$name" \
      --project="$GCP_PROJECT" \
      --member="serviceAccount:${sa}" \
      --role='roles/secretmanager.secretAccessor' \
      --quiet >/dev/null
  done
}

need_cmd gcloud
need_cmd openssl
load_env_file "$ENV_FILE"

GCP_PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
GCP_REGION="${GCP_REGION:-australia-southeast1}"
[[ -n "$GCP_PROJECT" && "$GCP_PROJECT" != "(unset)" ]] || die "set GCP_PROJECT in $ENV_FILE"

[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is required in $ENV_FILE"
[[ -n "${DATABASE_OWNER_URL:-}" ]] || die "DATABASE_OWNER_URL is required in $ENV_FILE"
if [[ "$DATABASE_URL" == *"127.0.0.1"* || "$DATABASE_URL" == *"localhost"* ]]; then
  die "DATABASE_URL looks local — use the Supabase pooler URL in $ENV_FILE"
fi

if [[ -z "${SESSION_HMAC_SECRET:-}" ]]; then
  SESSION_HMAC_SECRET="$(openssl rand -hex 32)"
  echo "SESSION_HMAC_SECRET=$SESSION_HMAC_SECRET" >> "$ENV_FILE"
  echo "deploy: generated SESSION_HMAC_SECRET and appended to $ENV_FILE"
fi

[[ -n "${SMTP_HOST:-}" ]] || die "SMTP_HOST is required in $ENV_FILE"
[[ -n "${SMTP_USER:-}" ]] || die "SMTP_USER is required in $ENV_FILE"
[[ -n "${SMTP_PASS:-}" ]] || die "SMTP_PASS is required in $ENV_FILE"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_FROM="${SMTP_FROM:-$SMTP_USER}"
APP_ORIGIN="${APP_ORIGIN:-auto}"

echo "deploy: project=$GCP_PROJECT region=$GCP_REGION service=$SERVICE"

if ! gcloud projects describe "$GCP_PROJECT" >/dev/null 2>&1; then
  die "cannot access project $GCP_PROJECT — run: gcloud auth login && gcloud auth application-default login"
fi

echo "deploy: enabling APIs"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  --project="$GCP_PROJECT" >/dev/null

if ! gcloud artifacts repositories describe "$AR_REPO" \
  --project="$GCP_PROJECT" \
  --location="$GCP_REGION" >/dev/null 2>&1; then
  echo "deploy: creating Artifact Registry repo $AR_REPO"
  gcloud artifacts repositories create "$AR_REPO" \
    --project="$GCP_PROJECT" \
    --location="$GCP_REGION" \
    --repository-format=docker \
    --description='Smorg Apps images' >/dev/null
fi

IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/${SERVICE}"
TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
IMAGE_TAG="${IMAGE}:${TAG}"

SECRET_DATABASE_URL=smorg-database-url
SECRET_DATABASE_OWNER_URL=smorg-database-owner-url
SECRET_SESSION=smorg-session-hmac
SECRET_SMTP_PASS=smorg-smtp-pass
SECRET_APP_ORIGIN=smorg-app-origin

echo "deploy: syncing Secret Manager"
ensure_secret "$SECRET_DATABASE_URL" "$DATABASE_URL"
ensure_secret "$SECRET_DATABASE_OWNER_URL" "$DATABASE_OWNER_URL"
ensure_secret "$SECRET_SESSION" "$SESSION_HMAC_SECRET"
ensure_secret "$SECRET_SMTP_PASS" "$SMTP_PASS"

if [[ "$APP_ORIGIN" != "auto" && -n "$APP_ORIGIN" ]]; then
  ensure_secret "$SECRET_APP_ORIGIN" "$APP_ORIGIN"
elif ! gcloud secrets describe "$SECRET_APP_ORIGIN" --project="$GCP_PROJECT" >/dev/null 2>&1; then
  # Placeholder until the service URL is known after first deploy.
  ensure_secret "$SECRET_APP_ORIGIN" "https://placeholder.invalid"
fi

PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
grant_secret_access "$RUNTIME_SA" \
  "$SECRET_DATABASE_URL" \
  "$SECRET_DATABASE_OWNER_URL" \
  "$SECRET_SESSION" \
  "$SECRET_SMTP_PASS" \
  "$SECRET_APP_ORIGIN"

SECRET_ENV=(
  "DATABASE_URL=${SECRET_DATABASE_URL}:latest"
  "DATABASE_OWNER_URL=${SECRET_DATABASE_OWNER_URL}:latest"
  "SESSION_HMAC_SECRET=${SECRET_SESSION}:latest"
  "SMTP_PASS=${SECRET_SMTP_PASS}:latest"
  "APP_ORIGIN=${SECRET_APP_ORIGIN}:latest"
)
SECRET_ENV_CSV="$(IFS=,; echo "${SECRET_ENV[*]}")"

PLAIN_ENV=(
  "NODE_ENV=production"
  "SMTP_HOST=${SMTP_HOST}"
  "SMTP_PORT=${SMTP_PORT}"
  "SMTP_USER=${SMTP_USER}"
  "SMTP_FROM=${SMTP_FROM}"
)
PLAIN_ENV_CSV="$(IFS=,; echo "${PLAIN_ENV[*]}")"

echo "deploy: building image via Cloud Build → $IMAGE_TAG"
gcloud builds submit \
  --project="$GCP_PROJECT" \
  --config=cloudbuild.yaml \
  --substitutions="_IMAGE=${IMAGE},_TAG=${TAG}" \
  --quiet

echo "deploy: upserting migrate job"
gcloud run jobs deploy "$JOB" \
  --project="$GCP_PROJECT" \
  --region="$GCP_REGION" \
  --image="$IMAGE_TAG" \
  --service-account="$RUNTIME_SA" \
  --set-secrets="$SECRET_ENV_CSV" \
  --set-env-vars="$PLAIN_ENV_CSV" \
  --command=pnpm \
  --args=migrate \
  --max-retries=1 \
  --task-timeout=10m \
  --memory=512Mi \
  --cpu=1 \
  --quiet

echo "deploy: running migrations"
gcloud run jobs execute "$JOB" \
  --project="$GCP_PROJECT" \
  --region="$GCP_REGION" \
  --wait \
  --quiet

echo "deploy: deploying Cloud Run service"
gcloud run deploy "$SERVICE" \
  --project="$GCP_PROJECT" \
  --region="$GCP_REGION" \
  --image="$IMAGE_TAG" \
  --service-account="$RUNTIME_SA" \
  --set-secrets="$SECRET_ENV_CSV" \
  --set-env-vars="$PLAIN_ENV_CSV" \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --timeout=60s \
  --quiet

SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --project="$GCP_PROJECT" \
  --region="$GCP_REGION" \
  --format='value(status.url)')"

if [[ "$APP_ORIGIN" == "auto" || -z "$APP_ORIGIN" ]]; then
  echo "deploy: setting APP_ORIGIN=$SERVICE_URL"
  ensure_secret "$SECRET_APP_ORIGIN" "$SERVICE_URL"
  # Rewrite .env.production auto → concrete URL for next time (optional comfort).
  if grep -q '^APP_ORIGIN=auto' "$ENV_FILE" 2>/dev/null; then
    # macOS/BSD sed
    sed -i.bak "s|^APP_ORIGIN=auto|APP_ORIGIN=${SERVICE_URL}|" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
  fi
  gcloud run services update "$SERVICE" \
    --project="$GCP_PROJECT" \
    --region="$GCP_REGION" \
    --update-secrets="APP_ORIGIN=${SECRET_APP_ORIGIN}:latest" \
    --quiet
fi

echo
echo "deploy: live at $SERVICE_URL"
echo "deploy: health  $SERVICE_URL/api/health"
