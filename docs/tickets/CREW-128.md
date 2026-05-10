# CREW-128 — Re-alias Crew Semantic Colors to Tailwind slate (Phase A)

Jira: https://safturento.atlassian.net/browse/CREW-128

## Goal

Re-alias the 27 active color variables in Crew DS Figma's `Crew / Semantic Colors` collection (`DsA7QuEa2WthDATkksd1Bq`) directly to Core's `tw/colors` collection — skipping Core's `mode` indirection — so Crew DS resolves to the same blue-tinted slate that the dashboard ships at runtime.

## Plan reference

`docs/superpowers/plans/2026-05-10-crew-ds-palette-correction.md` — Phase A, Tasks A1–A4. (Plan ships on the spec PR #162; lives at the same path once merged.)

## What landed in this PR

The autonomous run executed Phase A end-to-end via `use_figma` against Crew DS file `DsA7QuEa2WthDATkksd1Bq`. All 27 active variables across groups 1a + 1b are now aliased to `tw/colors` directly.

### Group 1a — 19 standard shadcn semantics re-aliased

Previously aliased to `Core / mode / *` (which in turn pointed at `tw/colors/neutral/*` — pure grayscale). Now both light and dark mode point at the same `tw/colors` target (mode-invariant; mode resolution moves up to the consumer side):

| Crew semantic            | → tw/colors target |
| ------------------------ | ------------------ |
| `background`             | `slate/950`        |
| `foreground`             | `slate/200`        |
| `card`                   | `slate/900`        |
| `card-foreground`        | `slate/200`        |
| `popover`                | `slate/900`        |
| `popover-foreground`     | `slate/200`        |
| `primary`                | `slate/200`        |
| `primary-foreground`     | `slate/900`        |
| `secondary`              | `slate/800`        |
| `secondary-foreground`   | `slate/200`        |
| `muted`                  | `slate/800`        |
| `muted-foreground`       | `slate/400`        |
| `accent`                 | `slate/800`        |
| `accent-foreground`      | `slate/200`        |
| `destructive`            | `red/400`          |
| `destructive-foreground` | `slate/50`         |
| `border`                 | `white`            |
| `input`                  | `white`            |
| `ring`                   | `slate/500`        |

`border` / `input` alias to `tw/colors/white` (RGB only) — consumer fills carry the alpha, e.g. the migrated frames use opacity 0.04/0.06/0.07/0.12, which resolves to `white × captured alpha` for the correct overlay effect.

### Group 1b — 8 state tokens re-aliased

Previously already aliased to `tw/colors`, but at the wrong shade level for three of them. All 8 now mode-invariant:

| State token          | → tw/colors target | Change           |
| -------------------- | ------------------ | ---------------- |
| `state/initializing` | `blue/400`         | was `blue/500`   |
| `state/running`      | `slate/400`        | unchanged        |
| `state/idle`         | `slate/500`        | unchanged        |
| `state/waiting`      | `amber/400`        | unchanged        |
| `state/pr-open`      | `violet/400`       | was `violet/500` |
| `state/error`        | `red/400`          | was `red/500`    |
| `state/finished`     | `emerald/500`      | unchanged        |
| `state/foreground`   | `slate/950`        | unchanged        |

### Verification

- A1 baseline audit: returned 44 color variables, matching the spec's 19 + 8 + 5 + 8 + 4 group split.
- A2 verification script re-read all 19 group-1a aliases against the expected mapping in both light + dark modes — `{ passed: true, mismatches: [] }`.
- A3 verification script re-read all 8 group-1b aliases against the expected mapping in both modes — `{ passed: true, mismatches: [] }`.
- A3 screenshot of the StateBadge component set (node `20:23`) shows the three shifted states rendering at their lighter `*-400` shades. Running/idle/waiting/finished render identically to before.

### Untouched (deferred)

Per the plan's explicit out-of-scope list, the following 17 variables are still aliased through `Core / mode` and will be addressed when first runtime usage surfaces them:

- 5 `chart-*` tokens (`chart-1` through `chart-5`)
- 8 `sidebar-*` tokens (`sidebar`, `sidebar-foreground`, …, `sidebar-ring`)
- 4 kit-extras (`background-color`, `semantic-background`, `semantic-border`, `semantic-foreground`)

## User action required (Phase A4)

The Figma Plugin API has no `publishLibrary()` equivalent — the Assets-panel "Publish library" action must be triggered in the Figma desktop UI:

1. Open **Crew Design System** (`DsA7QuEa2WthDATkksd1Bq`) in the Figma desktop app
2. Open the Assets panel → click **Publish library**
3. Confirm the publish review (should show 27 variable updates)
4. Once published, consumers (the screens file `9FeJPriqdsdA4n9R5Xsrr8`) will receive the new aliases on next file open — the cache-invalidation step is covered in CREW-130.

## Relevant files

- Crew DS Figma file (`DsA7QuEa2WthDATkksd1Bq`) — the actual mutation target; nothing in the codebase changed.
- `docs/superpowers/plans/2026-05-10-crew-ds-palette-correction.md` — Phase A plan (lands via PR #162).

## Decisions

- **Strictly Phase A scope** — Phase B (dashboard CSS) is CREW-129 and runs in parallel; Phases C+D (verification + visual fixes + docs) are CREW-130 and gated on the user's Figma publish. This ticket does not touch any of those surfaces.
- **No code commits beyond this doc** — Phase A's only deliverable in Figma. The PR's purpose is to record what was done and trigger the user-facing publish step.

## Notes

The execution shape matches the plan exactly: A1 → A2 (import + re-alias + verify) → A3 (re-alias + verify + screenshot) → A4 (handoff). No deviations or surprises.
