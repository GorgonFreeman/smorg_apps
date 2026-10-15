# Itinerarium wireframes

Low-fidelity layouts for v1. Aligns with [spec.md](spec.md). Narrow (phone) first; desktop is the same column, wider max-width.

## 1. Trips list

```
┌─────────────────────────────────────┐
│ Itinerarium              Settings   │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────┐  ┌──────────┐         │
│  │ Japan    │  │ Weekend  │         │
│  │ 12–20 Apr│  │ 3–4 May  │         │
│  │ 14 events│  │ 4 events │         │
│  └──────────┘  └──────────┘         │
│                                     │
│  ┌──────────┐                       │
│  │ + New    │                       │
│  │   trip   │                       │
│  └──────────┘                       │
│                                     │
└─────────────────────────────────────┘
```

Empty state: centred copy “No trips yet” + primary **New trip**.

Create trip: simple dialog — Name (required), Start date, End date, Timezone (prefilled).

## 2. Timeline (view)

```
┌─────────────────────────────────────┐
│ ← Japan                    Edit     │
│ 12–20 Apr · Asia/Tokyo      Share   │
├─────────────────────────────────────┤
│                                     │
│         12 Apr                      │
│           │                         │
│           ●─┬─ 09:00  Narita arrive │
│           │ │  Narita Airport       │
│           │                         │
│           ●─┬─ 14:30  Hotel check-in│
│           │ │  Shinjuku             │
│           │                         │
│         13 Apr                      │
│           │                         │
│        ───●─── now                  │
│           │                         │
│           ●─┬─ 11:00  TeamLab       │
│           │ │  Toyosu               │
│           │                         │
│           ○─┬─ (no time) Pack bags  │
│             │                       │
└─────────────────────────────────────┘
```

- Vertical spine centred; blocks sit to the right of the line.
- Day labels interrupt the spine.
- “now” is a horizontal tick when inside the trip range; initial scroll centres it (or nearest event).
- Tap block → detail sheet: full notes (markdown), place link, document names (open local / Drive link).

## 3. Timeline (edit)

```
┌─────────────────────────────────────┐
│ ← Japan                    Done     │
├─────────────────────────────────────┤
│              +                      │
│           │                         │
│           ●─┬─ 09:00  Narita   Edit │
│           │                         │
│              +                      │
│           │                         │
│           ●─┬─ 14:30  Hotel    Edit │
│           │                         │
│              +                      │
│           │                         │
│           ●─┬─ 11:00  TeamLab  Edit │
│           │                         │
│              +                      │
└─────────────────────────────────────┘
```

- Extra vertical gap vs view mode.
- **+** between every pair and at both ends → opens create form with `position` seeded for that slot.
- **Edit** → event form for that event.

## 4. Event create / edit

```
┌─────────────────────────────────────┐
│ Event                         ✕     │
├─────────────────────────────────────┤
│ Title *                             │
│ [ TeamLab Planets             ]     │
│                                     │
│ Place                               │
│ [ Toyosu                      ]     │
│ Place link                          │
│ [ https://maps…               ]     │
│                                     │
│ Start (datetime, optional)          │
│ [13 Apr 11:00]                      │
│ End (datetime)     Duration         │
│ [13 Apr 14:00]     [ 3 h ]          │
│ Empty start = untimed (sits after   │
│ previous timed event). Duration     │
│ sets end from start; editing end    │
│ updates duration.                   │
│                                     │
│ Notes                               │
│ [ Buy tickets online…         ]     │
│ [ markdown OK                 ]     │
│                                     │
│ Documents                           │
│  • tickets.pdf        [local]  ✕    │
│  • booking.png        [Drive]  ✕    │
│  [ + Add file ]                     │
│                                     │
│ [ Delete event ]        [ Save ]    │
└─────────────────────────────────────┘
```

- Modal on desktop; full-height sheet on small screens.
- Add file: if Drive credentials exist, offer Local vs Drive; else Local only.

## 5. Settings

```
┌─────────────────────────────────────┐
│ ← Settings                          │
├─────────────────────────────────────┤
│ Google Drive                        │
│                                     │
│ Paste service account JSON          │
│ ┌─────────────────────────────────┐ │
│ │ { "type": "service_account",    │ │
│ │   ...                           │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Status: Connected as                │
│ itinerarium@….iam.gserviceaccount.com│
│                                     │
│ Share a Drive folder with that      │
│ email so uploads can land there.    │
│                                     │
│ [ Save ]              [ Clear ]     │
└─────────────────────────────────────┘
```

## 6. Share (owner)

From trip header **Share**:

```
┌─────────────────────────────────────┐
│ Share trip                    ✕     │
├─────────────────────────────────────┤
│ Anyone with the link can view       │
│ this trip (no login). Local files   │
│ stay on your device; Drive links    │
│ are included when available.        │
│                                     │
│ Link                                │
│ [ https://smorg.app/p/itinerarium/… ]│
│ [ Copy link ]                       │
│                                     │
│ [ Revoke link ]                     │
│ (creates a new link on next Copy    │
│  if none active)                    │
└─────────────────────────────────────┘
```

## 7. Public trip page

```
┌─────────────────────────────────────┐
│ Japan                               │
│ Shared itinerary · view only        │
├─────────────────────────────────────┤
│         (same timeline as view,     │
│          no Edit / Share / Settings)│
│                                     │
│ Event detail: notes + Drive links   │
│ only (no local file open).          │
└─────────────────────────────────────┘
```

Unauthenticated chrome: minimal (app name + trip title), no Hub chrome that requires login.
