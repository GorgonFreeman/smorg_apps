# Itinerarium

App for planning trips and following them on a day-of timeline. Smorg app: Lit client, Hono routes under `/api/apps/itinerarium`, Postgres schema `itinerarium`, platform OTP auth (no per-app auth).

Wireframes: [wireframes.md](wireframes.md).

## v1 scope

**In**
- Trips list (tiles) and trip timeline (view + edit)
- Events: title, place, optional times, markdown notes, documents
- Local document storage on the owner’s device (IndexedDB)
- Google Drive via service account JSON in Settings (optional; uploads instead of / in addition to local)
- Public view-only share link (unauthenticated)
- Day separators on a continuous vertical timeline
- Auto-centre timeline near “now”

**Out of v1**
- Offline-first sync / service worker caching of trip API data (network required for trip CRUD; local docs remain readable on the device that stored them)
- Maps autocomplete, push notifications, multi-user editing, collaborators
- Core `people` linkage for places
- Drag-and-drop reorder when an event has a time (time wins; see Ordering)

## Screens and behaviour

### Trips list
- Route: `/apps/itinerarium` (and `/apps/itinerarium/trips`).
- Trips as tiles: trip name, date range (from trip `start_date` / `end_date`), event count.
- Empty state with create action.
- Actions: create trip, open trip, open Settings, open share controls from trip (also available inside the trip).

### Timeline (view)
- Route: `/apps/itinerarium/trips/:tripId`.
- Vertical line with rounded event blocks.
- On load, scroll so “now” is centred, or the nearest event if the trip is entirely in the past/future.
- A subtle “now” marker on the line when the current time falls within the trip’s date range.
- Day headers when the calendar day changes between consecutive events (trip timezone).
- Event block shows: time (if any), title, place (if any); tap/click opens read-only detail (notes + document list).
- Primary control: **Edit** → edit mode.

### Timeline (edit)
- Same route; edit mode is a client state (not a separate URL required).
- Timeline gains slightly more vertical spacing.
- Each event shows an **Edit** control; **+** between events (and at ends) inserts a new event at that order position.
- Delete event from the event form (confirm).
- **Done** leaves edit mode.

### Event create / edit
- Modal (or full-screen sheet on narrow viewports) with fields below.
- Saving an event with a changed `start_at` re-runs ordering so it sits after other events with earlier times.

### Settings
- Route: `/apps/itinerarium/settings`.
- Paste Google Drive **service account JSON**; stored encrypted server-side for that user.
- Option to clear credentials.
- Short help: share a Drive folder with the service account email so uploads succeed.

### Public share
- Owner generates a secret token link from the trip (copy + revoke).
- Public route (unauthenticated), e.g. `/p/itinerarium/:token` or `/apps/itinerarium/share/:token` — exact path chosen at implementation to sit outside the login gate.
- View-only timeline + event detail (notes). No edit, no Settings.
- Local-only documents are **not** available to public viewers. Documents that were uploaded to Drive appear as links if the file is reachable (owner is responsible for Drive sharing).

## Data model

Schema: `itinerarium`. All owner tables include `user_id` and use platform RLS.

### Trip
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | owner |
| name | text | required |
| start_date | date | optional; list tile + now-marker range |
| end_date | date | optional |
| timezone | text | IANA, default from browser at create |
| created_at / updated_at | timestamptz | |

No cover image or colour in v1 (Hub app colour comes from the manifest).

### Event
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| trip_id | uuid | FK |
| user_id | uuid | owner (denormalised for RLS) |
| title | text | required |
| place_name | text | optional free text |
| place_url | text | optional URL (maps or other) |
| start_at | timestamptz | optional; omit for untimed events |
| end_at | timestamptz | optional; if set with `start_at`, must be ≥ `start_at` |
| duration_minutes | int | optional; persisted; see Time fields |
| notes | text | markdown; autolink bare URLs when rendering |
| position | int | trip-wide sequence order (see Ordering) |
| created_at / updated_at | timestamptz | |

**Time fields:** `start_at` and `end_at` are datetimes. The user may set `end_at` directly, or set `duration_minutes` which sets `end_at = start_at + duration` (requires `start_at`). Persist all three when known; keep them consistent on save:

- Change `duration_minutes` with `start_at` → recompute `end_at`.
- Change `end_at` with `start_at` → recompute `duration_minutes`.
- Clear `start_at` → event becomes untimed; clear `end_at` and `duration_minutes` as well (or leave them null).
- `end_at` / `duration_minutes` without `start_at` is invalid.

Untimed events omit `start_at` (and thus end/duration). No all-day flag. Day headers for untimed events follow the previous timed event’s calendar day in the trip timezone (or the trip `start_date` if they sit before any timed event).

### Document (metadata in DB; bytes not in Postgres)
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| event_id | uuid | FK |
| user_id | uuid | owner |
| file_name | text | |
| mime_type | text | |
| byte_size | int | |
| storage | enum | `local` \| `drive` |
| local_key | text | nullable; IndexedDB key on owner device |
| drive_file_id | text | nullable |
| drive_web_view_link | text | nullable |
| created_at | timestamptz | |

### Share link
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| trip_id | uuid | FK |
| user_id | uuid | owner |
| token | text | unique, unguessable |
| created_at | timestamptz | |
| revoked_at | timestamptz | nullable |

### Settings (per user)
| Field | Type | Notes |
|---|---|---|
| user_id | uuid | PK |
| drive_service_account_enc | text | nullable; encrypted JSON |
| updated_at | timestamptz | |

## Ordering

Each event has a trip-wide `position` (dense int). The timeline displays `ORDER BY position, id`.

- **+** inserts at that index and renumbers.
- Untimed events stay where they sit in the list. For day headers / “now” context they are treated as **after the previous timed event** in position order (or at the start of the trip if none precede them).
- Invariant: scanning the list, timed events (`start_at` set) appear in non-decreasing `start_at` order.
- When the user sets or changes `start_at`, move only that event to the correct index so the timed invariant holds (reinsert after the last event that should precede it by time; leave other events’ relative order alone, then renumber).
- Clearing `start_at` leaves the event untimed at its current `position`.
- Same `start_at`: stable by existing `position`, then `id`. No free drag of timed events across other timed times in v1 (time change is what relocates them).

## Documents

### Local
- Bytes in **IndexedDB** on the owner’s browser profile, keyed by `local_key` (document id).
- Device-bound by design: another device sees metadata but cannot open local bytes until re-attached or Drive is used.
- Limits: max **20 MB** per file; max **20** documents per event. Allowed: PDF, images (`image/*`), plain text, common office (`application/pdf`, `application/msword`, OOXML types). Reject others with a clear error.

### Google Drive
- User pastes a **service account JSON** key in Settings (as specified).
- Server uses it to upload to Drive when the user chooses Drive (or when Drive is configured and they opt to sync that file).
- Prefer uploading into a folder the user has shared with the service account’s client email; if no folder id is configured later, use the service account’s Drive root (document this limitation in Settings help).
- Public page may show `drive_web_view_link` for `storage = drive` docs only.

## Sharing

- Permission: **view-only** for v1.
- Lifecycle: create token → copy URL → revoke (soft: set `revoked_at`; old URL 404s).
- Public payload: trip name, timezone, dates, events (title, place, times, notes markdown), Drive document links. Exclude local blob payloads and service account material.
- Platform: public GET API + shell route that does not require a session cookie.

## Manifest (target)

```ts
export default {
  slug: 'itinerarium',
  name: 'Itinerarium',
  color: '#0D9488',
  version: '1.0.0',
  uses: [] as string[],
  migrations: './migrations',
}
```

## Non-goals reminder

Maps integration, collaborators, offline trip sync, Core people places, and drag-reorder of timed events are deferred past v1.
