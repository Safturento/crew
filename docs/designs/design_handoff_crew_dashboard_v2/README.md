# Handoff: Crew Dashboard — v2

A web UI for monitoring & orchestrating long-running coding agents (the "crew" daemon). Operators see every agent's live state at a glance, drill into a transcript when something needs attention, and kick off new runs against open Jira tickets.

---

## Changes since the previous export

This bundle supersedes `design_handoff_crew_dashboard/` (the "original export"). Two design areas changed; everything else (state palette, drawer chrome, modal flow, projects route, tokens) is unchanged from v1.

### 1. Agents list — row redesign

| Aspect | v1 (original) | v2 (this export) |
|---|---|---|
| Column order | state · key · **title** · runtime · tokens · action | state · key · **runtime · tokens · title** · action |
| Column widths | hard-coded (`100px 90px 1fr 90px 70px auto`) | **measured at first paint** from real data + the live sans/mono font; rendered as CSS vars (`--col-state`, `--col-id`, `--col-runtime`, `--col-tokens`) so every project section aligns identically. |
| Column header row | none | **new component** `ColumnHeaderRow` with five header-placement variants (`none` / `global` (sticky at top) / `per-section` / `floating` / `tab`). Default per design is `per-section`. |
| Row layout option | row-only | **new** `stacked` layout where state pill anchors the top-left, title spans the row, and a meta line below shows `state · ID · runtime · tokens` with optional iconified labels (`metaLabel: 'icon' \| 'text'`). Switched via the `rowLayout` tweak. |
| Quick actions | `waiting → Answer` · `pr_open → View PR ↗` · `error → Retry` · `finished → Archive` | `idle → Resume + Finish` · `waiting → Provide input` · `pr_open → View PR ↗ + Finish` · `error → Inspect` · `finished → none`. New `qa-group` wrapper renders the two-button case. `Inspect` (red) and `Provide input` (accent) are new variants. |
| Project section header | static | added a hover-revealed `Open project page` icon-button (`.project-section__open`) on the right of the title row. |

The redesign was driven by feedback that **runtime and tokens are the operator's secondary scan target** after state — pulling them left of the title (which is the longest, ellipsizable column) makes the at-a-glance read of "is this thing making progress?" much faster across multiple projects.

### 2. Agent drawer — Filters dropdown (replaces chip row)

The timeline's old chip-row filter (one chip per event type, click-to-toggle, inline above the segments) has been replaced by a single **Filters ▾** dropdown trigger in the controls bar. Same six event types, but now:

- **Trigger has two states** — `default` (all selected, ghost button) and `active` (subset selected, blue accent dot + mono `· N hidden` count + tinted border/bg).
- **Popover** anchored to the trigger, 296px wide, with a `Show events` header bar and `Select all · Clear all` action links bookending it. One row per type with a 16px checkbox, label, and per-agent count in mono-tabular numerals.
- **Persisted globally** (not per-agent) under `localStorage['crew.dashboard.timelineFilters']` as a string array of selected type IDs.
- **Empty state** — when zero types are checked, the timeline body shows a dashed-border card "No event types selected." with a `Show all` button.

Tool-name filtering (Bash / Read / Grep / …) is **intentionally out of scope** for v1 of this control — that's a separate UX problem (long, dynamic list).

Full spec: §"Timeline" below + the standalone `filters-spec.html` reference sheet in this folder.

---

## About the design files

Everything in `source/` is a **design reference**, not production code. It's a single-page React-via-Babel prototype I built to lock down the visual system, layout, and interaction model. **Do not ship this code.** Recreate the screens in the target codebase using its existing framework, component library, routing, and data layer.

The fonts (Hanken Grotesk + Fira Code), spacing scale (Tailwind 0.5 / 1 / 1.5 / 2 / then 4-multiples), and OKLCH state palette are intentional and should carry over. Everything else — file structure, component decomposition, state management — is up to the implementer.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, copy, and interactions. Recreate pixel-by-pixel where reasonable; substitute equivalent primitives from the target stack where not.

The prototype includes a **Tweaks panel** (toggle in the toolbar) exposing every visual variable I considered — density, attention treatment, accent saturation, fonts, row textures, etc. The current default values are the chosen design. The other options are documented in case product wants to revisit any of them; they are not all expected to ship.

---

## Surfaces / routes

The app has three routes, all served from a single shell with a fixed top nav (`crew` mark · Agents / Projects tabs · "Clear attention" button · "+ New Run" button).

| Hash | Route | Component(s) |
|---|---|---|
| `#/` | Agents list (home) | `AgentsList` → `ProjectSection` → `AgentRow` |
| `#/projects` | Projects list | `ProjectsRoute` |
| `#/projects/:name` | Project detail (TOML view + agents in this project) | `ProjectDetail` |
| `#/projects/:name/edit` | Edit project config | `ProjectEdit` |
| `#/projects/new` | Register new project | `ProjectEdit` |
| `#/agents/:key` | Agent detail (full page) | `AgentDrawerBody` reused |

The agent detail also opens as a **right-side drawer** (60% width, min 520, max 720) over the agents list when you click a row — same component, two presentations. On mobile/narrow viewport the drawer goes full-bleed.

### Top nav

- Brand: 22×22 rounded-square mark + "crew" wordmark (hide name <640px).
- Tabs: `Agents` (active when route is `/` or `/agents/*`), `Projects` (active for `/projects/*`).
- Right side: `Clear attention` button — disabled when no attention-state agents exist; enabled with a yellow numeric badge showing the count when agents are in `waiting` / `pr_open` / `error`. Clicking dismisses the favicon-badge attention state (does NOT change agent states; it just acknowledges them locally).
- `+ New Run` button (accent variant — solid white on dark) opens the New Run modal.

### Favicon attention badge

When ≥1 agent is in an attention state, the favicon must show a yellow dot/badge. Clearing attention resets it. The prototype uses a `<link rel="icon">` swap; production should do the same (Canvas-rendered or pre-rendered variants).

---

## The state palette

Every agent is in exactly one of seven states. State is the dominant visual signal across the app — pills, row tints, timeline segment borders, transcript markers — and the **only chromatic system in the design**. Everything else is dark warm slate neutrals.

| State | Color | Attention? | When |
|---|---|---|---|
| `initializing` | blue | no | Container booting, repo cloning |
| `running` | neutral (white) | no | Agent is executing tool calls |
| `idle` | gray | no | Agent has nothing to do (waiting on external trigger) |
| `waiting` | yellow | **yes** | Agent has asked operator a question |
| `pr_open` | purple | **yes** | PR submitted, awaiting review |
| `error` | red | **yes** | Agent crashed or hit an unrecoverable failure |
| `finished` | green | no | Run complete |

States are defined in code as `STATE_META` (see `source/agents-list.jsx` lines 3–11). Use this exact mapping.

### State pill component

Three intensity variants (controlled by `state-pill--{muted,mid,loud}`):

- **muted**: text + border only, no fill. Used in tight contexts (state history chips).
- **mid (default)**: translucent tinted bg + tinted border + tinted text. Used everywhere by default.
- **loud**: solid saturated fill, dark foreground (`#0a0c12`), with a colored halo box-shadow. Used when state needs to dominate.

Pill anatomy: leading status icon (animated `Pulse` for `running`/`initializing`, static `Dot` otherwise) + label. `font-family: var(--font-mono)` by default; the prototype exposed `pillFont` as a tweak (mono / sans / small-caps) — **chosen value is mono**.

Sizes: `sm` (10px / 2px·5px·2px·6px) and default `md` (11px / 3px·8px·3px·6px). Border-radius: 999px.

CSS reference: `source/styles.css` (inlined into `index.html` lines ~165–215). The implementation should mirror these values exactly.

---

## Screen 1 — Agents list (home)

The dashboard. Operator scans this constantly throughout the day.

### Layout

- Outer: `.app` flex container, centered content inside a `.viewport-frame` (max-width 100%, 14px radius, dark bg `#13141a`, soft outer shadow). The frame is the entire app surface — top nav lives inside it.
- Inside the frame: top nav (sticky-feel; not actually sticky in current build), then a scroll region (`.main-area`) containing:
  - `.agents-list` with 24px padding
  - `.agents-list__inner` max-width 1240px, centered, vertical gap 28px between project sections.

### Project sections

Agents are grouped by project. Each project section:

- **Header** (`.project-section__hd`): project name (14px / 600 / -0.015em tracking) · folder icon · count "`{n} active · {total} total`" · repo path on the right (`~/code/foo`, mono, dim). Underline border-bottom (1px var(--border)). Click toggles collapse. Hovering reveals a small "open project page" external-link icon button (`.project-section__open`, fades in on hover only).
- **Rows** (`.project-section__rows`): vertical stack, 6px gap, 4px top padding.
- **Empty state**: dashed-border card "No agents yet — start one with `+ New Run`".

Sort agents within a project by:
1. State priority (attention states first): `waiting → error → pr_open → running → initializing → idle → finished`
2. Then by `started` timestamp descending.

### Agent row (`.agent-row`)

The most important component. Carded row (1px border, 10px radius, `var(--surface)` bg `#1a1c24`).

Grid layout (desktop): `var(--col-state) var(--col-id) var(--col-runtime) var(--col-tokens) 1fr auto` columns, 16px gap, 12px·16px padding. Column widths are **measured once at first paint** by `measureColumnWidths()` (canvas-based text measurement against the live sans/mono fonts) so every project section aligns identically regardless of content; the implementer can substitute a layout-effect measurement or fixed CSS-grid template-columns if simpler.

Columns left → right (note: title is now to the right of the numerics — see Changes section above):
1. **State pill** — `<StateBadge state={a.state} intensity={tweaks.stateIntensity} />`
2. **Key** — e.g. `KAN-31` (mono, 12px, var(--text-2)).
3. **Runtime** — e.g. `33m 04s` (mono, tabular-nums, right-aligned). Wrapped in `<span class="runtime-live">` for active states (`running`, `initializing`) — adds a pulsing 5px blue dot via `::after` (animation `pulse 1.6s infinite`).
4. **Tokens** — formatted count, e.g. `48.2k` (mono, tabular-nums, right-aligned).
5. **Title** — single-line ellipsized ticket title (13.5px, var(--text)).
6. **Quick action** — context-sensitive button(s) per state. Multi-button cases use a `.qa-group` flex wrapper:
   - `idle` → `Resume` (default ghost) + `Finish` (subtle ghost)
   - `waiting` → `Provide input` (accent)
   - `pr_open` → `View PR ↗` (default ghost, opens external) + `Finish` (subtle ghost)
   - `error` → `Inspect` (danger / red ghost — new variant)
   - `running` / `initializing` / `finished` → no button (column reserves space, stays empty for alignment)
   Every button (and the wrapping `.qa-group`) calls `e.stopPropagation()` so clicks on the actions don't bubble up and open the drawer.

#### Column header row (`ColumnHeaderRow`)

Renders a header row using the same grid template as `AgentRow` so columns align. Cells: `State / ID / Runtime (right) / Tokens (right) / Task / (action gutter)`.

The `columnHeaders` tweak controls placement; the chosen production value is `per-section`:
- `none` — no headers.
- `global` — single sticky header at the top of the list (`.agents-list__sticky-hd`).
- `per-section` — header rendered once at the top of every project section's row stack.
- `floating` — same as per-section but ghosted (lower opacity, no rule).
- `tab` — header treated as a tab attached to the project's row stack (uses the `.project-section__rows--tab` modifier).

The header row is suppressed when `rowLayout === 'stacked'`.

#### Row layout (`rowLayout` tweak)

Two layouts:
- **`row`** (default) — the column grid described above.
- **`stacked`** — state pill anchors the top-left; title spans the full row beneath it; a meta line below the title shows `state · ID · runtime · tokens` separated by mono `·` dots. The meta line label style is controlled by `metaLabel`: `'text'` shows uppercase mini labels (`ID`, `Runtime`, `Tokens`), `'icon'` shows the corresponding `Icon.Hash` / `Icon.Clock` / `Icon.Tokens` icons. Stacked mode is the canonical mobile layout but is also exposed at desktop widths.

Hover: bg lifts to `var(--surface-2)`, border to `var(--border-strong)`. Click anywhere else opens the drawer.

#### Attention treatment (CRITICAL)

This is the visual hierarchy. Three levels (the chosen production setting is `strong`):

- **subtle**: state pill is the only signal. Row stays default surface.
- **medium**: row bg tinted with state color (~5% mix), border tinted (~14% mix).
- **strong** (default): tinted bg (~10% mix), tinted border (~30% mix), **3px left-edge marker** colored by state with `box-shadow: 0 0 14px {color}` halo, **`att-pulse 1.8s ease-in-out infinite` animation** on the marker, and an outer glow box-shadow on the row itself.

Only states with `attention: true` in `STATE_META` get tints — `waiting` (yellow), `pr_open` (purple), `error` (red). Non-attention states render as plain rows regardless of treatment setting.

CSS variables: `--att-color` is set per-state inside `.agent-row--strong.agent-row--tint-{yellow,red,purple}`.

#### Row textures (decorative)

The prototype lets users pick a subtle background texture for rows: none / grid / dots / stripes / stripes-thick / triangles / noise / scanlines / gradient. **Chosen value is `gradient`** — a 120deg state-tinted gradient overlay (8% mix, fades to transparent at 60%). All textures are absolutely-positioned `::after` (or `::before` for gradient) overlays, `pointer-events: none`. Content sits at `z-index: 1`.

Implementation: ship at least `none` and `gradient`. Other textures are nice-to-have visual variety but not required.

#### Density

Tight (8·14px padding) / Regular (12·16px) / Comfy (16·18px, 20px gap). **Default: regular.**

#### Mobile (narrow viewport)

Row collapses to a 3-column grid:
```
state    key      action
title    title    title
runtime  runtime  tokens
```
6px·10px gaps, 12px padding. See `.app--vw-mobile .agent-row` in CSS.

---

## Screen 2 — Agent detail (drawer + page)

Same component used in two presentations. Right-anchored drawer (60% / min 520 / max 720) over agents list, OR full-page at `#/agents/:key` with `.drawer--page` modifier (centered max-width 1100, no border, no animation).

### Header (`.drawer__hd`)

- **Top row**: breadcrumb `kanban-api / KAN-31` (mono key) · close button + actions on the right.
- **Title** — full ticket title, 18px / 600 / -0.015em / line-height 1.3 / `text-wrap: pretty`.
- **Meta line**: state pill · separator · started timestamp · sep · runtime (live-pulse if active) · sep · token count.
- **Links row**: pill-shaped link rows (`.link-row`) for: PR url, Jira url, branch name, container ID. Each shows a copy icon on hover. Mono font, dim color, `var(--surface)` bg.

### Body sections (in order)

1. **Token usage** — `TokenTable` component. 3-column table (Tool name / Token count / Share-with-bar). Both numeric headers are clickable to sort (toggles asc/desc, current sort shown with `↓`/`↑`). Bar fill is normalized to the max row, not the total. Footer row sums the total.

2. **State history** — `StateHistory` component. Horizontal pill-row chips, one per state segment in the transcript. Each chip = state pill (size sm, muted intensity) + timestamp; `→` arrow between chips. Clicking a chip jumps the timeline scroll position to that segment.

3. **Timeline** — the transcript. Components: `Timeline` → `FilterButton` → `FiltersPopover` → `StateSegmentGroup` → `ToolCallCard`.

   - **Controls bar**: `[ Filters ▾ ] [ Search………… ] [ Live ⚪ ]`. Filters dropdown on the left, search input fills the middle, live toggle on the right. On narrow drawer widths (<768px) Search drops to its own row beneath the Filters + Live row.

   - **Filters dropdown** (`FilterButton` + `FiltersPopover`): the v1 way to filter the timeline by event _type_. Tool-name filtering (Bash / Read / Grep / …) is intentionally out of scope — it's a separate UX problem (long, dynamic list).

     **Six event types** — the catalog the popover lists:
     - Tool calls
     - Assistant prose
     - Thinking
     - System
     - Hooks & skills
     - Other

     **`FilterButton` states** (`<FilterButton state>` — mapped to a `cva` variant by the implementer):

     | `state`    | When                                       | Visual                                                                                              |
     |---         |---                                         |---                                                                                                  |
     | `default`  | All six types selected                     | Funnel icon · `Filters` · chevron. Plain ghost button on `var(--surface)`, `border-color: var(--border)`. |
     | `active`   | One or more types unchecked                | Adds a 6px `var(--c-blue)` accent dot before the funnel + a mono count suffix `· N hidden`. Border tints to a 38% blue mix; bg shifts to a 10% blue mix on `--surface`. |

     Hover and focus apply on top of either state. The trigger is a `<button>` with `aria-haspopup="dialog"` + `aria-expanded`; chevron rotates 180° when open.

     **`FiltersPopover` (open) layout** — 296×auto, anchored to the trigger's left edge, 6px gap, `z-index: 40`. The implementer wraps it in Radix `Popover.Portal` + `Popover.Content` to inherit focus-trap, click-outside, and escape-to-close; the reference markup uses `role="dialog"` + manual handlers as a stand-in.

     ```
     ┌───────────────────────────────────────┐
     │ SHOW EVENTS    Select all · Clear all │   <- header bar (uppercase 10.5px label;
     ├───────────────────────────────────────┤        bookended action links, separator dot)
     │ ☑  Tool calls                  847 │   <- one row per type:
     │ ☑  Assistant prose             142 │        16px checkbox / label / mono count, right-aligned
     │ ☐  Thinking                      89 │        Click anywhere on the row toggles. Hover bg `surface-2`.
     │ ☑  System                        12 │        Counts are tabular-nums; pulled per-agent.
     │ ☑  Hooks & skills                 7 │
     │ ☑  Other                          3 │
     └───────────────────────────────────────┘
     ```

     - **Header bar**: `Show events` label on the left; `Select all` and `Clear all` as text-link buttons on the right separated by a `·`. Each disables when its action would be a no-op (`Select all` disabled when all are checked; `Clear all` disabled when none are checked).
     - **Rows**: 6 checkbox rows in fixed catalog order. Checkbox uses the accent color (`var(--c-blue)`) when checked. Counts are computed per-agent on open and shown in mono-tabular numerals; the daemon should index counts so this is a cheap per-agent read.
     - **Keyboard nav** (v1): on open, focus the first checkbox; arrow keys + space toggle (browser-native checkbox semantics inside the dialog suffice); `Esc` closes; tab cycles `Select all` → `Clear all` → row checkboxes.
     - **Animation**: 0.14s `cubic-bezier(.3,.7,.4,1)` — 4px translateY + 0.985 scale fade-in.

     **State persistence**: a single global `localStorage` key `crew.dashboard.timelineFilters` stores the selected-type ID array (`['tool', 'assistant', …]`). Read at component mount; write on every change. The preference applies across drawer opens and across agents — NOT per-agent. The implementer wraps the read/write pair in a `useLocalStorage` hook; the reference code keeps the calls explicit so the persistence shape is visible.

     **Empty state** — when zero types are checked the timeline body shows a dashed-border card with `No event types selected.` and a `Show all` button that re-checks all six. This carries forward the empty-state intent that was in the original chips spec but was missing from slice 1c.

   - **Segments**: each is a state segment with a left border colored by state (`segment--{color}`). Header row collapsible (chevron · state pill (sm) · "started HH:MM:SS" · "· N events").
   - **Events**: `ToolCallCard` rows. Two-line layout — line 1: `[ToolName]` colored tag + summary (ellipsized) · line 2: timestamp + token count (right-aligned dim mono). Click expands a `<pre>` showing the tool output (max-height 280px, scrollable). Tag colors per tool: bash=yellow, read=blue, edit/write=green, grep/glob=purple, question=yellow.
   - **Long segments scroll-cap**: when a segment has more events than `maxEventsPerSegment` (default 15), the items area becomes a scroll region with subtle dashed border + fade mask.
   - **Density**: `compact` (6·10px padding) or `padded` (10·12px). Default compact.
   - **New events pill**: when live mode appends and user has scrolled away, a sticky bottom-center pill "↓ N new events" jumps them back.

---

## Screen 3 — New Run modal

Three-step modal over a scrim. Steps shown in header: `1. Project · 2. Ticket · 3. Confirm`.

**Modal chrome**: max-width 560 (or 420 for `--sm`), border-radius 14px, `modal-in` animation (8px translateY + 0.98 scale fade-in, 0.2s).

### Step 1 — Project

- Search input (filters by name).
- Scrollable list (max 320px) of `MOCK_PROJECTS`. Each row: project name (left) + "{n} active runs" badge + "{total tickets open}" mono dim (right). Click selects and advances.

### Step 2 — Ticket

- Title shows selected project name.
- Search input.
- Scrollable list of `MOCK_TICKETS[project.jira_project_key]`. Each row: `KEY` (mono) + title (ellipsized) + priority pill (`high`/`medium`/`low` — red/yellow/dim).
- Back button returns to step 1.

### Step 3 — Confirm

- Summary card stack — three rows, each `100px label / 1fr value` grid:
  - PROJECT: project name + repo path
  - TICKET: key + title
  - BRANCH: auto-derived `crew/{key-lowercase}` (mono)
- Footer: `Cancel` (ghost) · `Start run` (accent).
- On confirm: close modal, optimistically prepend a new agent in `initializing` state to that project, show toast "Started {key}".

---

## Screen 4 — Projects route

### List (`#/projects`)

Header: "Projects" h1 + "Register project" button.

Table-style list with header row + body rows:
- Columns: `120px name / 1.5fr repo path / 90px branch / 80px Jira key / 70px active / 24px chevron`
- Header style: uppercase 11px, letter-spacing 0.06em, var(--text-3), surface-2 bg.
- Row click → navigate to `#/projects/{name}`.

### Detail (`#/projects/:name`)

- Header: project name h1 + "Edit config" button.
- Subhead "CONFIG"
- TOML view (`.toml-view`) — read-only mono, 12.5px, line-height 1.7, syntax-faithful but not syntax-highlighted in the proto. Render full project config.
- Subhead "ACTIVE AGENTS"
- Reuses `AgentsList` filtered to this project (no project header, just rows).

### Edit / Register (`#/projects/:name/edit`, `#/projects/new`)

Form (max-width 540, 12px gap between fields). Each field: uppercase label + text input.

Fields: name, repo_path, default_branch, jira_project_key, docker_compose, test_command.

Footer: Cancel (ghost) · Save (accent).

---

## Tweaks panel (NOT for production)

The prototype includes a draggable tweaks panel exposing every design variable. It's gated behind a host toolbar toggle and writes back to the source file in dev. **Do not port to production.** It exists only to document the alternatives I considered.

The chosen production values are baked into the defaults at the top of `source/app.jsx`:

```js
{
  rowDensity: "regular",
  timelineDensity: "compact",
  stateIntensity: "mid",
  attentionTreatment: "strong",
  bgWarmth: "warm",
  bgFamily: "gray",
  bgShade: 900,
  rowTexture: "gradient",
  pillPaddingStep: 6,        // px-1.5 = 6px horizontal
  maxEventsPerSegment: 15,
  accentSaturation: 0.16,
  monoFont: "Fira Code",
  sansFont: "Hanken Grotesk",
  pillFont: "mono",
  viewportWidth: "desktop"
}
```

---

## Design tokens

### Colors (dark theme)

```css
--bg:           #13141a   /* viewport frame bg */
--surface:      #1a1c24   /* cards, rows, table bg */
--surface-2:    #21232d   /* hover, table headers */
--surface-3:    #292c38   /* button hover */
--border:       rgba(255,255,255,0.07)
--border-strong:rgba(255,255,255,0.12)
--text:         #e7e8ec
--text-2:       #b8bbc4
--text-3:       #7e8290
--dim:          #6b6f7c
```

The outer page background (behind the viewport frame) is `#05060a`.

### State palette (OKLCH — saturation chroma `0.14` default)

```css
--c-blue:    oklch(0.70 0.14 250);
--c-neutral: oklch(0.78 0.005 260);
--c-gray:    oklch(0.65 0.01 260);
--c-yellow:  oklch(0.82 0.14 90);
--c-purple:  oklch(0.72 0.14 295);
--c-red:     oklch(0.70 0.14 25);
--c-green:   oklch(0.72 0.084 150);  /* chroma * 0.6 — green stays calmer */
```

`--chr` (chroma) is the master saturation knob; production value is **0.16**. All state colors derive from it.

Backgrounds and borders that tint with state use `color-mix(in oklch, var(--c-X) {pct}%, transparent)` consistently — values range from 5% (subtle row tints) to 30% (loud pill borders). Mix percentages are documented inline in the CSS.

### Typography

- **Sans**: `Hanken Grotesk`, weights 400 / 500 / 600 / 700. Fallback stack: `ui-sans-serif, system-ui, sans-serif`.
- **Mono**: `Fira Code`, weights 400 / 500. `font-feature-settings: 'calt' on, 'liga' on` for ligatures.
- **Body**: 14px / 1.5 line-height / -webkit-font-smoothing: antialiased.
- **Page title h1**: 22px / 600 / -0.02em.
- **Section title h2**: 18px / 600 / -0.015em.
- **Section labels**: 11px / 600 / uppercase / 0.08em letter-spacing / var(--text-3).
- **Tabular numerics**: `font-variant-numeric: tabular-nums` for all timestamps, runtimes, token counts.

### Radii

```css
--radius:    10px   /* default */
--radius-lg: 14px   /* viewport frame, modal */
--radius-sm: 6px    /* buttons, inputs */
```

State pills, badges, link rows, segmented controls: 999px (full pill).

### Spacing

Tailwind-aligned scale: 0 / 2 / 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 px. Pill horizontal padding follows a **step** index (1.5 = 6px is current default).

### Shadows

- Viewport frame: `0 0 0 1px rgba(255,255,255,0.02), 0 30px 80px -20px rgba(0,0,0,0.6)`
- Drawer: `-30px 0 80px -20px rgba(0,0,0,0.5)` (cast left)
- Modal: `0 30px 80px -10px rgba(0,0,0,0.7)`
- Toast: `0 12px 30px -6px rgba(0,0,0,0.6)`
- Loud pill halo: `0 0 0 1px {color}30%, 0 0 14px -2px {color}55%`
- Strong attention glow: `0 0 0 1px {att-color}22%, 0 0 32px -8px {att-color}40%`

### Animations

- `fade-in`: 0.15s opacity 0→1 (scrim).
- `slide-in`: 0.22s `cubic-bezier(.3,.7,.4,1)` translateX(20px)→0 + fade (drawer).
- `modal-in`: 0.2s same easing translateY(8px) + scale(0.98)→1 + fade.
- `pulse` (live runtime dot): 1.6s opacity 1↔0.3.
- `att-pulse` (strong attention left edge): 1.8s `ease-in-out` opacity 1↔0.4.
- `Pulse` icon (running/initializing state pill dot): rendered via `Icon.Pulse` SVG — 2 concentric circles with the inner pulsing.

---

## Behavior / interaction notes

- **Routing**: hash-based in proto (`useHashRoute` hook). Production should use the framework's router. Keep the URL shape (`/projects/:name`, `/agents/:key`) for deep-linkability.
- **Drawer ↔ page parity**: same content, same component. Detail at `/agents/:key` is a real route, not a modal — operators can paste links to specific runs.
- **Quick actions vs. row click**: stop propagation on action button clicks; row click opens the drawer.
- **Live mode** (timeline): defaults ON in the demo, but real impl wires this to a WebSocket from the daemon. New events get prepended/appended at segment-tail, with a sticky "N new events ↓" pill if the user scrolls up.
- **Empty states**: project with no runs shows the dashed-border message. Timeline with no events shows centered "No events yet" dim text.
- **Toasts**: bottom-center, surface-2 bg + strong border, 0.2s `modal-in`. 3s default duration, dismissable.
- **Copy buttons**: 18×18, ghost. Show check icon for 1.2s after copy.
- **Keyboard**: Esc closes drawer/modal. ⌘K = focus search (timeline search field). The proto exposes `<kbd>` styling — production should wire shortcuts.
- **Favicon attention**: yellow dot when ≥1 attention agent. Cleared by "Clear attention" button.

---

## State management

Operator state per route:

- **Agents list**: `collapsed: Record<projectName, boolean>` (locally; not persisted).
- **Drawer**: `expandedEntries: Set<entryId>`, `liveMode: boolean`, `searchQuery: string`, `scrollTarget: string | null` (for state-history jumps).
- **Token table**: `sort: { key: 'count'|'share', dir: 'asc'|'desc' }`.
- **Modal**: `step: 1|2|3`, `selectedProject`, `selectedTicket`.

Persistent (server):
- Project configs (CRUD via `#/projects/*`).
- Agent runs and their transcripts (read-only stream from daemon).

Real-time:
- WebSocket per agent (or fan-out) feeding new transcript entries.
- Agent state changes → optimistic favicon badge update.

---

## Assets

The prototype draws all icons inline as SVGs in `source/icons.jsx`. They're a Lucide-flavored set — the implementer should swap these for whatever icon library the target codebase uses (Lucide, Phosphor, Heroicons, etc.). Inventory:

`Pulse, Dot, ArrowRight, Chevron, Search, Plus, Check, Copy, External, X, Folder, GitBranch, Github, Jira, Container, MoreH`

The brand mark is inline SVG — a simple rounded square with an abstract glyph. Replace with whatever the actual product mark is.

No raster assets, no fonts beyond Google Fonts (Hanken Grotesk, Fira Code).

---

## Drawer breakpoints (timeline controls bar)

The drawer's controls bar `[Filters ▾] [Search…] [Live ⚪]` follows the dashboard UI spec §9 breakpoint set:

| Viewport            | Drawer width                  | Controls bar layout                                              |
|---                  |---                            |---                                                               |
| `≥1280px` desktop   | ~640px (drawer overlays list) | Single row. Filters left, search 1fr, Live right.                 |
| `768–1279px` tablet | ~75% width, min 520px         | Single row. Search shrinks; min-width on Filters / Live preserved. |
| `<768px` mobile     | full-screen sheet             | Wraps. Row 1: `[Filters ▾] [Live ⚪]`. Row 2: `[Search…]` full-width.    |

Mobile-only popover behaviour: the popover anchors to the Filters trigger's left edge but caps at `calc(100vw - 48px)` so it never clips the sheet edge.

## Files

```
source/
  index.html        — single-page shell, all CSS inlined
  styles.css        — extracted copy of the inline CSS for reference
  app.jsx           — root, routing, top nav, modal/drawer orchestration, TWEAK_DEFAULTS
  agents-list.jsx   — STATE_META, StateBadge, AgentRow, ProjectSection, AgentsList
  agent-drawer.jsx  — TokenTable, StateHistory, Timeline, ToolCallCard, drawer body
  new-run-modal.jsx — 3-step modal (project → ticket → confirm)
  projects-route.jsx— Projects list, detail (TOML view), edit/register form
  mock-data.jsx     — MOCK_PROJECTS, MOCK_TICKETS, MOCK_AGENTS, transcript factories
  icons.jsx         — inline SVG icon set
  tweaks-panel.jsx  — dev-only tweaks shell (DO NOT PORT)
```

To preview: open `source/index.html` in any browser. No build step.

---

## Implementation plan checklist

A suggested order for tickets:

1. **Foundation** — design tokens (colors, type, spacing, radii) as CSS vars or theme primitive. State palette + state-pill component (3 intensities, 2 sizes, 7 states).
2. **App shell** — viewport frame, top nav, hash/route stub, "Clear attention" + favicon badge plumbing.
3. **Agents list** — `AgentsList` + `ProjectSection` + `AgentRow` (no real data yet — wire to daemon next).
4. **Daemon integration** — WebSocket / SSE / poll to populate agents + transcripts. Replace `MOCK_*`.
5. **Agent drawer + full page** — header, token table, state history, timeline. Wire transcript stream.
6. **New Run modal** — 3-step flow + Jira API integration for ticket list + POST to daemon to start run.
7. **Projects route** — list, detail (TOML render), edit/create form, persistence.
8. **Polish** — empty states, error states, toasts, keyboard shortcuts (Esc, ⌘K), responsive viewport.
9. **QA** — attention treatments, live-mode resilience, drawer/page parity, dark-only color contrast (4.5:1+ on text).

Treat each as a Jira epic; AC for each is "matches the design at the corresponding section above, with the listed component breakdown."
