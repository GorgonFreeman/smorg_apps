# Smorg Apps: Specification

## Overview

Smorg Apps is a personal app ecosystem: a single web platform that hosts all the apps I build, so anyone can sign up and start using them.

Users log in with their email and a one-time code. After login they land on the **Hub**, which shows the apps they've added, each as its name on a coloured circle (grey by default). To add more, they visit the **Gallery**, which lists every app on the platform. Adding an app requires accepting a consent screen that says which shared data it uses. Every user starts with **Core**, a built-in first app for managing shared contacts (**people**), which other apps can read from.

Under the hood it's one web app on one domain, so one login covers everything. A Vite + Lit front end (styled with DaisyUI) talks to a small Node API, backed by a single Postgres database on Supabase. Each app gets its own database schema, and Row Level Security keeps every user's data separate. Auth is custom, so it can move off Supabase later. It runs on Google Cloud.

New apps are added by dropping in a folder with a manifest, a Lit client, server routes and SQL migrations, then deploying. Nothing in the Hub or Gallery needs to change.

---

## Detail

### 1. Goals and non-goals

**Goals**
- A platform where I can keep adding my own apps over time.
- Anyone can sign up and use it (open signup).
- One login, one origin, shared data where it's useful.
- Portable: no lock-in to Supabase-specific auth or APIs.

**Non-goals**
- No third-party developers. All apps are written and controlled by me, so there is no sandboxing, no per-app tokens, and no per-entity permission grants.
- No per-app authentication. Apps never handle auth.
- No passwords.
- No second demo app in v1 (install + Hub/Gallery + Core is enough).
- No uninstall UI in v1 (install-only; uninstall semantics still exist server-side for later).

### 2. Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript throughout |
| Monorepo | pnpm workspaces |
| Front end | Vite + Lit |
| UI components | DaisyUI (on Tailwind CSS), stylesheet injected into every shadow root |
| API server | Hono on Node, serving the API and the built front end from one container |
| API conventions | Mineral response shape + ArgsWarden-style validation; client HTTP via `@foxtware/mineral`'s `customFetch` |
| Database | Supabase Postgres, accessed directly with `pg` (Kysely optional), not supabase-js or PostgREST |
| Auth | Custom email OTP with opaque cookie sessions (no Supabase Auth) |
| Email | Nodemailer behind a `Mailer` interface |
| Hosting | Google Cloud Run, one container |
| Supporting GCP services | Secret Manager, Artifact Registry, Cloud Build or GitHub Actions, Cloud Run Jobs (migrations) |
| Region | Cloud Run `australia-southeast1` (Sydney), Supabase `ap-southeast-2` |

**Why not Next.js / shadcn:** shadcn/ui is React-only, so it's out given the Lit decision. Next.js is also unnecessary because everything is behind a login and needs no SSR.

**Mineral (option A):** Hono remains the HTTP shell. Handlers return the mineral `{ ok, data, error, meta, results }` envelope. The Lit client calls Smorg endpoints with mineral's `customFetch` (and `credentials: 'include'` for the session cookie). Do not re-set `Content-Type: application/json` when using `customFetch` with a body — it already sets that. Depend on npm `@foxtware/mineral`. If the published `customFetch` needs a thin browser-safe re-export (e.g. for ESM / no `Buffer`), put that adapter in `packages/ui` or `packages/shell` and still call through mineral's implementation where possible.

### 3. Front end

**3.1 Lit + DaisyUI, with Shadow DOM and an injected stylesheet**

DaisyUI is a Tailwind plugin whose classes are global CSS. Lit components use Shadow DOM, and global classes do not pierce shadow roots. We keep Shadow DOM (full style encapsulation, `<slot>` support) and **inject the compiled DaisyUI/Tailwind stylesheet into every shadow root**.

How it works:
- Tailwind + DaisyUI are built once into a single CSS file. Tailwind scans the source of the shell, `packages/ui` and every `apps/*/client`, so classes used in any Lit template are included.
- The CSS is imported as a string (Vite `?inline`) and turned into **one shared `CSSStyleSheet`** with `replaceSync()`.
- A shared base class, `SmorgElement`, extends `LitElement` and overrides `createRenderRoot()`: it calls `super.createRenderRoot()`, then appends the shared sheet to the root's `adoptedStyleSheets`. Every component in the shell and every app extends `SmorgElement`.
- Because the same `CSSStyleSheet` instance is adopted by every root, the CSS is parsed once and shared in memory, not duplicated per component.
- The same CSS is also loaded in the main document (see below).

Things the setup must handle:
- **Theme variables:** DaisyUI themes are CSS custom properties set via `data-theme` on `<html>`. Custom properties inherit through shadow boundaries, so themes work, but only if the stylesheet is also loaded in the document. Selectors that depend on an ancestor attribute (e.g. `[data-theme=dark] .btn`) do not match inside a shadow root, so rely on variables, not ancestor selectors.
- **Tailwind `@property` rules:** these do not work inside shadow roots and must be registered in the document, which is another reason the stylesheet is also loaded globally.
- **Dark mode:** use DaisyUI themes (or a media query), not Tailwind `dark:` variants keyed to an ancestor selector.
- **Forms:** inputs inside a shadow root do not participate in an outer `<form>`. Forms live entirely within one component and submit via JS, or use `ElementInternals` for form-associated components.
- **Accessibility:** `id`/`for`/`aria-*` references do not cross shadow boundaries, so keep labelled controls in the same root.
- **DaisyUI components** that rely on sibling or parent selectors (modal, tabs, drawer, dropdown) work as long as the whole structure is inside one shadow root.
- **Slots:** `<slot>` works as normal, so shared components such as `smorg-card` and `smorg-dialog` can take child content.

**3.2 Structure**
- A shell (header, navigation, user menu) wraps all pages.
- Routes: `/login`, `/hub`, `/gallery`, `/apps/:slug/*`.
- Each app's client entry is **lazy-loaded** (dynamic import) the first time `/apps/:slug` is opened.
- The shell passes the current user to apps. Apps never talk to the auth endpoints.

**3.3 Hub**
- Shows only the apps the user has installed.
- Each app is a tile: its **name over a coloured SVG circle**.
- Colour comes from the manifest `color`. If omitted, the circle is **grey (`#9CA3AF`)**.
- Clicking a tile opens the app at `/apps/:slug`.

**3.4 Gallery**
- **Always lists all apps** on the platform, installed or not.
- Apps the user has installed are shown at **half opacity**, and still clickable, which opens the app.
- Installed apps also show a **tick (✓) after the name**, so the state never relies on opacity alone.
- Apps not yet installed show an Add action, which opens the consent screen.
- **v1 is install-only:** no Uninstall control in the UI (server uninstall may exist later).
- Contrast note: the tick and a legible label must remain readable at 50% opacity; check this during build.

**3.5 Consent screen**
- Shown when adding an app, and it **blocks installation** until accepted.
- Its text is generated from the manifest `uses` list (e.g. "Budget will use your People").
- Accepting calls the install endpoint. Cancelling does nothing.
- There are no per-entity grants. Consent is a one-time gate, and all apps share freely.

### 4. Apps and the manifest

Each app is a folder in the monorepo:

```
apps/<slug>/
  manifest.ts
  client/        Lit entry + components (lazy-loaded)
  server/        Hono routes, mounted at /api/apps/<slug>/*
  migrations/    plain SQL files
```

**Manifest**

```ts
export default {
  slug: 'budget',
  name: 'Budget',
  color: '#10B981',        // omit → default grey circle
  version: '1.0.0',
  uses: ['people'],        // shared entities; drives consent text
  migrations: './migrations',
}
```

- `uses` is informational and drives consent text. There is **no `dependsOn`** and no `requires` or grants model.
- Apps are registered at build time by discovering manifests in `apps/*`.
- On deploy, discovered manifests are **upserted into `platform.apps`** (slug, name, color, version). Removing an app folder is a later concern; v1 assumes apps only get added.
- Shipping a new app means: add the folder, add migrations, deploy.
- Client modules and server routers are wired from the same discovery: Vite code-splits each `apps/*/client` entry; Hono mounts each `apps/*/server` under `/api/apps/<slug>`.

### 5. Core app

- **Core** is the first app and is **installed by default for every user**.
- It's installed in the same transaction that creates the user.
- It is **non-removable**.
- **v1 scope:** people (contacts) only. **Cards are completely out** (no schema, no UI, no `uses: ['cards']`). Addresses and other shared entities can follow later.
- Its data lives in the `core` schema.
- Other apps read shared data by referencing the person **uuid** (`person_id uuid references core.people(id)`), not by copying fields. `handle` is the human-facing unique key within a user's address book.
- In future, Core may instead be added during a **mandatory tutorial** after first login. To support that, `installApp(userId, slug)` is **idempotent** and is the single code path for installing any app.

**5.1 People**

| Field | Required | Notes |
|---|---|---|
| `id` | yes (server) | `uuid` PK; used by other apps as FK |
| `user_id` | yes (server) | owner; RLS |
| `handle` | **yes** | Unique ID **per user**; case-insensitive uniqueness; trim; store canonical lowercased form |
| `first_name` | no | |
| `middle_name` | no | |
| `last_name` | no | |
| `email` | no | Single string for now; arrays later; **duplicates allowed** (even for the same user) |
| `phone` | no | Single string for now; arrays later |
| `notes` | no | Free text |
| `created_at` / `updated_at` | yes (server) | |

**List UI**
- Sorted **alphabetical by handle**.
- Each row shows **handle, first name, last name** (empty name parts simply blank).
- **Search box** with elastic (forgiving) matching: substring / trigram over handle, first, middle, last, email, phone, notes. Postgres-backed (`ILIKE` and/or `pg_trgm`) — **not** a separate Elasticsearch service.

**Deletes:** hard delete. No soft-delete column.

**Validation**
- `handle`: required, non-empty after trim, unique per user (case-insensitive). Prefer a stable slug charset (e.g. letters, digits, `.` `_` `-`); reject whitespace.
- Email (when present): basic format check after normalise (trim + lowercase). Phone: no strict format in v1.

### 6. Database

One Postgres database (Supabase), separated into schemas.

```
core      shared entities: people (more later)
platform  ecosystem machinery: users, sessions, otp_codes, rate_limits,
          apps, installations, migrations
app_<slug>  one schema per app, e.g. app_budget.transactions
```

**6.1 Platform tables (sketch)**

```sql
platform.users         (id uuid pk, email unique, created_at)
platform.sessions      (token_hash pk, user_id, expires_at, created_at, last_seen_at)
platform.otp_codes     (id, email, code_hash, expires_at, attempts, consumed_at)
platform.rate_limits   (key, window_start, count)
platform.apps          (slug pk, name, color, version)
platform.installations (user_id, app_slug, installed_at, app_version)
platform.migrations    (app, filename, applied_at)
```

There is **no `grants` table**.

**6.2 Core people (sketch)**

```sql
core.people (
  id uuid pk,
  user_id uuid not null references platform.users,
  handle text not null,          -- stored lowercased
  first_name text,
  middle_name text,
  last_name text,
  email text,                    -- stored lowercased when present; duplicates OK
  phone text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  unique (user_id, handle)
)
-- RLS: own_rows on user_id; FORCE ROW LEVEL SECURITY
-- optional: gin/trgm indexes for search
```

**6.3 Row Level Security**
- Every user-owned table has a `user_id` column and RLS enabled with `FORCE ROW LEVEL SECURITY`.
- Policy pattern on every such table:

```sql
CREATE POLICY own_rows ON core.people
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
```

- With no Supabase Auth there is no `auth.uid()`. Instead, **every request runs in a transaction that sets the user**:

```ts
await db.tx(async (t) => {
  await t.query('select set_config(\'app.user_id\', $1, true)', [userId]);
  return fn(t);
});
```

- If the setting is missing, the policy evaluates to null and returns no rows (**fails closed**).

**6.4 Database roles**
- **Owner role:** runs migrations only.
- **App role:** used by the running server. It is not the table owner and **does not have `BYPASSRLS`**.
- Both are separate from Supabase's own admin roles.

**6.5 Connections**
- Use Supabase's **pooler in transaction mode**. It works with transaction-local settings.
- Cloud Run needs the pooler's IPv4 endpoint, since the direct connection is IPv6-only.
- The setup is plain Postgres, so leaving Supabase later means changing a connection string.

**6.6 Migrations**
- Plain SQL files per app folder, tracked in `platform.migrations`.
- Migrations run **at deploy time for everyone**, as a **Cloud Run Job before each deployment**, creating `app_<slug>` schemas and tables once.
- Installing an app therefore does not create schemas. It only runs **per-user setup** when needed (Core v1 has none beyond the install row).

### 7. Installing and uninstalling apps

**Install (`installApp(userId, slug)`)**
1. Confirm the app exists in the registry.
2. Insert a row in `platform.installations` (no-op if already present).
3. Run the app's optional per-user setup.

The consent screen sits in front of this call in the UI, and the API requires an explicit consent flag on the request.

**Server-side guard:** `/api/apps/:slug/*` rejects requests from users who haven't installed that app, and the client route does the same.

**Uninstall**
- Semantics (for later): remove the `installations` row only; **user data stays**, so reinstalling restores everything; Core cannot be uninstalled.
- **v1 UI:** install-only; no uninstall control.

### 8. Authentication (custom email OTP)

**Principles:** no passwords, no third-party auth service, portable to any host.

**8.1 OTP flow**
1. User enters their email; the client calls `POST /api/auth/request-code` via `customFetch`.
2. Server **normalises email** (trim + lowercase), generates a 6-digit code with `crypto.randomInt`, stores an **HMAC hash** (server secret) with a **10-minute expiry**, and emails the code.
3. User enters the code; client calls `POST /api/auth/verify`.
4. Server checks the hash, expiry, single-use and attempt cap (**max 5 attempts**), and on success creates a session.
5. If the user doesn't exist, they are **created on first successful verify** (open signup), and Core is installed in the same transaction. Stored `platform.users.email` is the normalised form.

**Rules**
- Codes are single-use, expire after 10 minutes, and are never stored in plain text.
- The request endpoint always replies in the mineral envelope with a generic message (e.g. data message "If that email is valid, a code is on its way"), so it never reveals whether an email exists.

**8.2 Sessions**
- **Opaque random tokens**, not JWTs.
- Stored as a cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, scoped to the single origin.
- Only the **hash** of the token is stored in `platform.sessions`, which makes sessions revocable.
- **Lifetime: 60 days**, with **sliding refresh**: on authenticated requests, bump `last_seen_at` and extend `expires_at` to now + 60 days (throttle bumps if desired, e.g. at most once per hour).
- Mutating requests also validate the `Origin` header (CSRF protection).
- Logout deletes the session row.

**8.3 Abuse protection**
- Because signup is open, anyone can trigger emails to any address, so **rate-limit** the request endpoint **per email, per IP and globally**.
- Counters live in Postgres (`platform.rate_limits`); no Redis.
- Consider a CAPTCHA (e.g. Cloudflare Turnstile) on the request endpoint if abuse appears.

**8.4 Same origin, one session**
- All apps and the API are served from the same origin (e.g. `smorg.app/hub`, `smorg.app/apps/budget`).
- One session cookie covers everything. **There is never per-app auth.**

### 9. API (mineral-shaped, Hono-hosted)

**9.1 Response envelope** (from mineral)

```ts
interface MineralResponse {
  ok: boolean
  data?: unknown
  error?: {
    code: string
    message: string
    details?: unknown
    field?: string
  }
  meta?: {
    page?: number
    pageSize?: number
    total?: number
    [key: string]: unknown
  }
  results?: MineralResponse[]
}
```

- HTTP status roughly follows mineral: success `200`, auth failure `401`, validation/business failure often still `200` with `ok: false` **or** map clearly as decided in implementation — prefer consistency with mineral's `statusCodeFromResult` where reused.
- Empty lists are `ok: true, data: [], meta: { total: 0 }`.
- Hard deletes that succeed return `ok: true` (data optional).

**9.2 Client**
- All browser → API calls use mineral `customFetch(url, { method, body, headers, params })`.
- Session cookie: pass fetch options so cookies are sent (`credentials: 'include'` — extend or wrap `customFetch` if the stock helper does not forward this yet).
- Never set `Content-Type: application/json` manually when the body is a plain object.

**9.3 Platform routes**

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/request-code` | Body: `{ email }`. Always generic success copy. |
| `POST` | `/api/auth/verify` | Body: `{ email, code }`. Sets session cookie; creates user + Core if new. |
| `POST` | `/api/auth/logout` | Deletes session. |
| `GET` | `/api/me` | Current user `{ id, email }` or `401`. |
| `GET` | `/api/apps` | Registry: all apps (for Gallery). |
| `GET` | `/api/apps/installed` | Apps the user has installed (for Hub). |
| `POST` | `/api/apps/install` | Body: `{ slug, consent: true }`. Idempotent install. |

**9.4 Core people routes** (mounted under `/api/apps/core`, install-guarded)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/apps/core/people` | List; query `q` optional search. Sorted by handle. `data: Person[]`, `meta.total`. |
| `GET` | `/api/apps/core/people/:id` | One person by uuid. |
| `POST` | `/api/apps/core/people` | Create. Body: person fields; `handle` required. |
| `PATCH` | `/api/apps/core/people/:id` | Update. Changing `handle` must respect uniqueness. |
| `DELETE` | `/api/apps/core/people/:id` | Hard delete. |

`Person` JSON uses camelCase over the wire: `id`, `handle`, `firstName`, `middleName`, `lastName`, `email`, `phone`, `notes`, `createdAt`, `updatedAt`.

Error codes (examples): `VALIDATION_ERROR`, `HANDLE_TAKEN`, `NOT_FOUND`, `NOT_INSTALLED`, `UNAUTHORIZED`.

### 10. Email

- Sending uses **Nodemailer**, behind a minimal interface so providers can be swapped by changing one file:

```ts
interface Mailer { send(to: string, subject: string, body: string): Promise<void> }
```

- **Development:** Mailpit (Docker), or log codes to the console.
- **Production (for now):** **SMTP via a personal Gmail address** (`smtp.gmail.com`, port 587), authenticated with a Google **app password** stored in Secret Manager. The Gmail account needs 2-Step Verification turned on to create an app password. Codes will be sent from that Gmail address, since Gmail rewrites the From header to the authenticated account.
- Known limits: a personal Gmail account has a daily send cap (roughly 500 recipients a day), which is ample for OTP codes at the start. Spam-folder risk is accepted for now. Google Cloud blocks outbound port 25, so self-hosting a mail server on Compute Engine is not a viable alternative.
- Nodemailer is only a client: it hands mail to an SMTP server and does not deliver it itself. Google Cloud has no free built-in outbound email service, and sending directly from Cloud Run to recipients' mail servers would need port 25 (blocked) and would land in spam without SPF, DKIM and an established IP reputation.
- No dedicated email provider is used at this stage. Moving to one later is a change to the `Mailer` implementation only.

### 11. Hosting and deployment (Google Cloud)

- One container (Hono serving the API and the built Vite assets) on **Cloud Run**, region `australia-southeast1`.
- Secrets (database URLs, HMAC secret, SMTP credentials) in **Secret Manager**.
- Images in **Artifact Registry**, built by Cloud Build or GitHub Actions.
- Deploy sequence: build image → run the migrations **Cloud Run Job** → deploy the new revision.
- Supabase project in `ap-southeast-2` to keep latency low.

### 12. Repository layout (monorepo, pnpm workspaces)

```
/
  docs/spec.md
  package.json          # pnpm workspace root
  pnpm-workspace.yaml
  packages/
    shell/       Vite + Lit shell: login, Hub, Gallery, consent screen
    ui/          SmorgElement, shared Lit components, customFetch adapter if needed
    server/      Hono server: auth, install, registry, app route mounting
    db/          pool, tx helper, migration runner
  apps/
    core/        people only (default, non-removable)
    <others>/    each with manifest.ts, client/, server/, migrations/
```

Workspace packages depend on `@foxtware/mineral` from npm for `customFetch` (and any other helpers we deliberately reuse, e.g. response/status helpers).

### 13. Decisions log

| Decision | Outcome |
|---|---|
| Name | **Smorg Apps** (Lyf was taken) |
| Front end | Vite + Lit + TypeScript |
| UI library | DaisyUI (shadcn dropped, as it is React-only) |
| Shadow DOM | On: compiled DaisyUI/Tailwind CSS injected into every shadow root via one shared `CSSStyleSheet` (also loaded globally for theme variables and `@property` rules) |
| Backend | Hono on Node |
| API style | Mineral envelope + `customFetch` client; Hono hosts REST routes (option A) |
| Mineral package | npm `@foxtware/mineral` |
| Database | Supabase Postgres, direct `pg`, no supabase-js |
| Data isolation | RLS via `app.user_id` set per transaction |
| Auth | Custom email OTP, opaque cookie sessions, no built-in auth |
| Email | Nodemailer behind `Mailer`; free Gmail/Workspace SMTP for now; emails normalised (trim + lowercase) |
| Sessions | 60 days, sliding refresh |
| Origin | Single origin, shared auth, never per-app auth |
| Hosting | Google Cloud Run (Sydney) |
| Grants | None; consent screen blocks install; all apps share freely |
| Manifest | `slug, name, color, version, uses, migrations`; no `dependsOn`; upserted to `platform.apps` on deploy |
| Core | Default first app, auto-installed, non-removable; **people only in v1** |
| People | `handle` required + unique per user; hard delete; list by handle showing handle/first/last; elastic Postgres search; email duplicates OK; no multi-value arrays yet |
| Cards | Out completely for now |
| Gallery | Shows all apps; installed at 50% opacity, clickable, tick after name; **install-only UI in v1** |
| Hub | Installed apps only; name on coloured SVG circle, default grey |
| Second app | Not required for v1 |
| Monorepo | pnpm workspaces |
| Third-party developers | None |
| Uninstall | Data stays; reinstall restores it; no UI in v1 |

### 14. Open items

- Final domain name for the single origin.
- Whether to add Turnstile from day one or only on abuse.
- Pooler vs. direct connection for the migration job (the direct connection is IPv6-only).
- Future mandatory tutorial that installs Core, and what it contains.
- Whether to use Kysely or plain `pg` queries.
- Exact `handle` charset rules (propose: `[a-z0-9._-]+` after lowercasing).
- How to forward `credentials: 'include'` through mineral `customFetch` if not supported upstream yet.
- Verify 50% opacity contrast in the DaisyUI themes chosen.
- Confirm Tailwind and DaisyUI versions, and test that theme variables and `@property` rules behave correctly with the stylesheet loaded both globally and in shadow roots.
- Decide how to handle forms (self-contained per component vs. `ElementInternals`) as the first real forms are built in Core.

### 15. Suggested build order

1. pnpm workspace scaffold; Supabase project, roles, `platform` schema, migration runner.
2. Custom OTP auth with Nodemailer, sessions (60-day sliding), RLS transaction helper, mineral-shaped responses.
3. Shell with `SmorgElement`, DaisyUI theme, Hub and Gallery; wire `customFetch`.
4. Registry from manifests → `platform.apps`, `installApp`, consent screen and install guard.
5. Core app with people (CRUD + search).
6. Cloud Run deployment, migration Job and CI.
