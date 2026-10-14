# Smorg Apps: Specification

## Overview

Smorg Apps is a personal app ecosystem: a single web platform that hosts all the apps I build, so anyone can sign up and start using them.

Users log in with their email and a one-time code. After login they land on the **Hub**, which shows the apps they've added, each as its name on a coloured circle (grey by default). To add more, they visit the **Gallery**, which lists every app on the platform. Adding an app requires accepting a consent screen that says which shared data it uses. Every user starts with **Core**, a built-in first app for managing shared data like people and credit cards, which other apps can read from.

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

### 2. Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript throughout |
| Front end | Vite + Lit |
| UI components | DaisyUI (on Tailwind CSS), stylesheet injected into every shadow root |
| API server | Hono on Node, serving the API and the built front end from one container |
| Database | Supabase Postgres, accessed directly with `pg` (Kysely optional), not supabase-js or PostgREST |
| Auth | Custom email OTP with opaque cookie sessions (no Supabase Auth) |
| Email | Nodemailer behind a `Mailer` interface |
| Hosting | Google Cloud Run, one container |
| Supporting GCP services | Secret Manager, Artifact Registry, Cloud Build or GitHub Actions, Cloud Run Jobs (migrations) |
| Region | Cloud Run `australia-southeast1` (Sydney), Supabase `ap-southeast-2` |

**Why not Next.js / shadcn:** shadcn/ui is React-only, so it's out given the Lit decision. Next.js is also unnecessary because everything is behind a login and needs no SSR.

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
- Contrast note: the tick and a legible label must remain readable at 50% opacity; check this during build.

**3.5 Consent screen**
- Shown when adding an app, and it **blocks installation** until accepted.
- Its text is generated from the manifest `uses` list (e.g. "Budget will use your People and Cards").
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
  slug: "budget",
  name: "Budget",
  color: "#10B981",        // omit → default grey circle
  version: "1.0.0",
  uses: ["people", "cards"], // shared entities; drives consent text
  migrations: "./migrations",
}
```

- `uses` is informational and drives consent text. There is **no `dependsOn`** and no `requires` or grants model.
- Apps are registered at build time by discovering manifests in `apps/*`.
- Shipping a new app means: add the folder, add migrations, deploy.

### 5. Core app

- **Core** is the first app and is **installed by default for every user**.
- It's installed in the same transaction that creates the user.
- It is **non-removable**.
- It provides the UI for managing shared entities: **people** and **credit cards** (addresses and others can follow).
- Its data lives in the `core` schema.
- Other apps read shared data by referencing it by ID (e.g. `person_id uuid references core.people`) rather than copying it.
- In future, Core may instead be added during a **mandatory tutorial** after first login. To support that, `installApp(userId, slug)` is **idempotent** and is the single code path for installing any app.

**Credit cards:** never store full card numbers or CVVs (avoids PCI scope). Store only nickname, brand, last four digits, expiry, and an optional billing-cycle date. If real payments are ever needed, use Stripe tokens.

### 6. Database

One Postgres database (Supabase), separated into schemas.

```
core      shared entities: profiles, people, cards, addresses, ...
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

**6.2 Row Level Security**
- Every user-owned table has a `user_id` column and RLS enabled with `FORCE ROW LEVEL SECURITY`.
- Policy pattern on every such table:

```sql
CREATE POLICY own_rows ON app_budget.transactions
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
```

- With no Supabase Auth there is no `auth.uid()`. Instead, **every request runs in a transaction that sets the user**:

```ts
await db.tx(async (t) => {
  await t.query("select set_config('app.user_id', $1, true)", [userId]);
  return fn(t);
});
```

- If the setting is missing, the policy evaluates to null and returns no rows (**fails closed**).

**6.3 Database roles**
- **Owner role:** runs migrations only.
- **App role:** used by the running server. It is not the table owner and **does not have `BYPASSRLS`**.
- Both are separate from Supabase's own admin roles.

**6.4 Connections**
- Use Supabase's **pooler in transaction mode**. It works with transaction-local settings.
- Cloud Run needs the pooler's IPv4 endpoint, since the direct connection is IPv6-only.
- The setup is plain Postgres, so leaving Supabase later means changing a connection string.

**6.5 Migrations**
- Plain SQL files per app folder, tracked in `platform.migrations`.
- Migrations run **at deploy time for everyone**, as a **Cloud Run Job before each deployment**, creating `app_<slug>` schemas and tables once.
- Installing an app therefore does not create schemas. It only runs **per-user setup** (e.g. seeding default categories).

### 7. Installing and uninstalling apps

**Install (`installApp(userId, slug)`)**
1. Confirm the app exists in the registry.
2. Insert a row in `platform.installations` (no-op if already present).
3. Run the app's optional per-user setup.

The consent screen sits in front of this call in the UI, and the API requires an explicit consent flag on the request.

**Server-side guard:** `/api/apps/:slug/*` rejects requests from users who haven't installed that app, and the client route does the same.

**Uninstall**
- Removes the `installations` row only.
- **User data stays**, so reinstalling restores everything.
- Core cannot be uninstalled.

### 8. Authentication (custom email OTP)

**Principles:** no passwords, no third-party auth service, portable to any host.

**8.1 OTP flow**
1. User enters their email; the client calls `POST /api/auth/request-code`.
2. Server generates a 6-digit code with `crypto.randomInt`, stores an **HMAC hash** (server secret) with a **10-minute expiry**, and emails the code.
3. User enters the code; client calls `POST /api/auth/verify`.
4. Server checks the hash, expiry, single-use and attempt cap (**max 5 attempts**), and on success creates a session.
5. If the user doesn't exist, they are **created on first successful verify** (open signup), and Core is installed in the same transaction.

**Rules**
- Codes are single-use, expire after 10 minutes, and are never stored in plain text.
- The request endpoint always replies "If that email is valid, a code is on its way", so it never reveals whether an email exists.

**8.2 Sessions**
- **Opaque random tokens**, not JWTs.
- Stored as a cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, scoped to the single origin.
- Only the **hash** of the token is stored in `platform.sessions`, which makes sessions revocable.
- Mutating requests also validate the `Origin` header (CSRF protection).
- Logout deletes the session row.

**8.3 Abuse protection**
- Because signup is open, anyone can trigger emails to any address, so **rate-limit** the request endpoint **per email, per IP and globally**.
- Counters live in Postgres (`platform.rate_limits`); no Redis.
- Consider a CAPTCHA (e.g. Cloudflare Turnstile) on the request endpoint if abuse appears.

**8.4 Same origin, one session**
- All apps and the API are served from the same origin (e.g. `smorg.app/hub`, `smorg.app/apps/budget`).
- One session cookie covers everything. **There is never per-app auth.**

### 9. Email

- Sending uses **Nodemailer**, behind a minimal interface so providers can be swapped by changing one file:

```ts
interface Mailer { send(to: string, subject: string, body: string): Promise<void> }
```

- **Development:** Mailpit (Docker), or log codes to the console.
- **Production (for now):** **SMTP via a personal Gmail address** (`smtp.gmail.com`, port 587), authenticated with a Google **app password** stored in Secret Manager. The Gmail account needs 2-Step Verification turned on to create an app password. Codes will be sent from that Gmail address, since Gmail rewrites the From header to the authenticated account.
- Known limits: a personal Gmail account has a daily send cap (roughly 500 recipients a day), which is ample for OTP codes at the start. Spam-folder risk is accepted for now. Google Cloud blocks outbound port 25, so self-hosting a mail server on Compute Engine is not a viable alternative.
- Nodemailer is only a client: it hands mail to an SMTP server and does not deliver it itself. Google Cloud has no free built-in outbound email service, and sending directly from Cloud Run to recipients' mail servers would need port 25 (blocked) and would land in spam without SPF, DKIM and an established IP reputation.
- No dedicated email provider is used at this stage. Moving to one later is a change to the `Mailer` implementation only.

### 10. Hosting and deployment (Google Cloud)

- One container (Hono serving the API and the built Vite assets) on **Cloud Run**, region `australia-southeast1`.
- Secrets (database URLs, HMAC secret, SMTP credentials) in **Secret Manager**.
- Images in **Artifact Registry**, built by Cloud Build or GitHub Actions.
- Deploy sequence: build image → run the migrations **Cloud Run Job** → deploy the new revision.
- Supabase project in `ap-southeast-2` to keep latency low.

### 11. Repository layout (monorepo)

```
/
  spec.md
  packages/
    shell/       Vite + Lit shell: login, Hub, Gallery, consent screen
    ui/          SmorgElement base class (injects shared stylesheet) + shared Lit components (DaisyUI)
    server/      Hono server: auth, install, registry, app route mounting
    db/          pool, tx helper, migration runner
  apps/
    core/        people, cards (default, non-removable)
    <others>/    each with manifest.ts, client/, server/, migrations/
```

### 12. Decisions log

| Decision | Outcome |
|---|---|
| Name | **Smorg Apps** (Lyf was taken) |
| Front end | Vite + Lit + TypeScript |
| UI library | DaisyUI (shadcn dropped, as it is React-only) |
| Shadow DOM | On: compiled DaisyUI/Tailwind CSS injected into every shadow root via one shared `CSSStyleSheet` (also loaded globally for theme variables and `@property` rules) |
| Backend | Hono on Node |
| Database | Supabase Postgres, direct `pg`, no supabase-js |
| Data isolation | RLS via `app.user_id` set per transaction |
| Auth | Custom email OTP, opaque cookie sessions, no built-in auth |
| Email | Nodemailer behind `Mailer`; free Gmail/Workspace SMTP for now |
| Origin | Single origin, shared auth, never per-app auth |
| Hosting | Google Cloud Run (Sydney) |
| Grants | None; consent screen blocks install; all apps share freely |
| Manifest | `slug, name, color, version, uses, migrations`; no `dependsOn` |
| Core | Default first app, auto-installed, non-removable |
| Gallery | Shows all apps; installed at 50% opacity, clickable, tick after name |
| Hub | Installed apps only; name on coloured SVG circle, default grey |
| Third-party developers | None |
| Uninstall | Data stays; reinstall restores it |

### 13. Open items

- Final domain name for the single origin.
- Whether to add Turnstile from day one or only on abuse.
- Pooler vs. direct connection for the migration job (the direct connection is IPv6-only).
- Future mandatory tutorial that installs Core, and what it contains.
- Whether to use Kysely or plain `pg` queries.
- Verify 50% opacity contrast in the DaisyUI themes chosen.
- Confirm Tailwind and DaisyUI versions, and test that theme variables and `@property` rules behave correctly with the stylesheet loaded both globally and in shadow roots.
- Decide how to handle forms (self-contained per component vs. `ElementInternals`) as the first real forms are built in Core.

### 14. Suggested build order

1. Supabase project, roles, `platform` schema, migration runner.
2. Custom OTP auth with Nodemailer, sessions and the RLS transaction helper.
3. Shell with `SmorgElement`, DaisyUI theme, Hub and Gallery.
4. Registry from manifests, `installApp`, consent screen and install guard.
5. Core app with people and cards.
6. A second app that uses Core data, to prove sharing and the install flow.
7. Cloud Run deployment, migration Job and CI.
