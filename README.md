# Smorg Apps

Personal app ecosystem: one login, Hub + Gallery, Core people contacts.

See [docs/spec.md](docs/spec.md).

## Quick start

1. Copy env: `cp .env.example .env`
2. Start Postgres (Docker optional): `docker compose up -d postgres`
3. Install: `pnpm install`
4. Migrate: `pnpm migrate`
5. Dev: `pnpm dev`  
   - API: http://localhost:3000  
   - UI: http://localhost:5173  

OTP codes log to the server console when `SMTP_HOST` is empty.

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | API + Vite shell together |
| `pnpm migrate` | Apply platform + app SQL migrations |
| `pnpm build` | Build shell (served by API in production) |

## Layout

```
packages/db      pool, RLS tx helper, migrations
packages/server  Hono API (auth, install, mounts apps)
packages/ui      SmorgElement + mineral-shaped customFetch
packages/shell   Lit Hub / Gallery / login
apps/core        People CRUD
```
