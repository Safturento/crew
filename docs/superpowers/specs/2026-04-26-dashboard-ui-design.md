# Dashboard UI — design brief

> **Purpose of this document.** A hand-off brief for `claude design` (frontend-design skill) to generate the visual UI for crew's dashboard. It defines audience, surfaces, content priorities, lifecycle/state coding, interaction patterns, and visual direction — but intentionally does **not** prescribe pixel mockups, exact spacing tokens, or component implementation. Those are claude design's job.
>
> Read [`docs/plans/architecture.md`](../../plans/architecture.md) first for system context. The dashboard is one of four packages; this brief covers only its UI shape.

## 1. Audience & use cases

**Audience.** A solo developer (the project owner) running headless Claude Code agents via `crew` against one or more registered repositories. Personal-use; no auth, no multi-tenant, no SaaS layer.

**Primary use modes**, mixed within a single session:

- **Active launch.** Kick off a `crew run`, watch Docker spin up and the agent start tool-calling.
- **Passive monitoring.** Dashboard parked in a tab on a vertical monitor or phone (over Tailscale) while attention is elsewhere; status visible at a glance.
- **Drill-down inspection.** Pop into a specific agent to inspect its timeline, find a specific tool call, or check token totals.
- **Triage by attention signal.** A favicon badge tells you something needs you; you go look.

**Concurrency.** Bursts. 0–6 agents at once is normal; sometimes more. Across multiple registered projects.

**Done criterion** (extends the architecture doc's): "I open `localhost:7773` and see every active agent's progress without touching a terminal — and I can also start, resume, and finish runs from the same UI."

## 2. Information architecture & navigation

**Navigation pattern: list-first with side-drawer drill-down.**

| Route              | Surface                        | Notes                                                                           |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------- |
| `/`                | **Agents (home)** — the canvas | Always visible; agents grouped by project, drawer opens over it                 |
| `/agent/:key`      | **Agent detail (drawer)**      | Slides in from right over the list (desktop) or as full-screen sheet (mobile)   |
| `/agent/:key/full` | **Agent detail (full page)**   | Same content, dedicated page — opened via "↗ Open as page" button on the drawer |
| `/projects`        | **Projects**                   | Full page (not a drawer); list + register/edit/remove                           |

**Top nav** (lean):

- Left: `Agents` · `Projects` (current route highlighted).
- Right: global **`+ New Run`** button + **`Clear attention`** control (only visible when ≥ 1 sticky badge is set).

**Routing rules:**

- The drawer always renders _over_ the agent list. Browser back closes the drawer (returns to `/`).
- A direct deep link to `/agent/:key` mounts the agents list behind the drawer so back/close behavior is consistent regardless of entry point.
- The full-page variant (`/agent/:key/full`) is a standalone route — browser back behaves normally (returns to whichever route was previously in history).

## 3. Lifecycle, states & visual coding

An agent has **one current state at any time**, with a stored history of transitions. The transcript timeline (§5) is segmented and grouped by these state-runs.

| State             | Color                     | Attention?             | Typical primary action |
| ----------------- | ------------------------- | ---------------------- | ---------------------- |
| **Initializing**  | Blue                      | No                     | (none — wait)          |
| **Running**       | Neutral (foreground text) | No                     | (none — wait)          |
| **Idle / Paused** | Gray                      | No                     | Resume / Finish        |
| **Waiting on me** | Yellow                    | **Yes** (sticky badge) | Provide input / review |
| **PR open**       | Purple                    | **Yes** (sticky badge) | View PR / merge        |
| **Error**         | Red                       | **Yes** (sticky badge) | Inspect logs           |
| **Finished**      | Muted gray-green          | No                     | (terminal)             |

**Attention rules:**

- "Attention" states raise a **sticky favicon badge** until manually cleared.
- A "Clear attention" control in the top nav dismisses all badges at once.
- Viewing an agent's detail does **not** auto-clear its badge — sticky means sticky.
- No browser notifications, no sound. Favicon badge is the entire out-of-tab attention surface.

**One agent per ticket key.** A ticket flows `crew run` → `crew fix-pr` → `crew finish` as **one continuous agent** in the dashboard, not three rows. State transitions are persisted; the timeline is segmented per state-run.

## 4. Home — the agent list

**Layout.** Project sections, each collapsible, stacked vertically. Section headers show project name + count of active runs.

**Within each section,** rows for each agent. Columns:

| Column       | Treatment                                                       |
| ------------ | --------------------------------------------------------------- |
| State badge  | Colored, leftmost — fastest scan target                         |
| Ticket key   | Monospace (FiraCode), e.g. `KAN-23`                             |
| Ticket title | Truncated with ellipsis as width shrinks                        |
| Runtime      | Elapsed wall-time, live-updating for active agents              |
| Token total  | Single number with `k`/`M` suffix, monospace                    |
| Quick action | State-driven button (see below); blank for Initializing/Running |

**Quick action mapping (per state):**

- Initializing → none
- Running → none
- Idle / Paused → "Resume" (opens fix-pr modal) and "Finish"
- Waiting on me → "Resume" (opens fix-pr modal)
- PR open → "View PR" (external link), "Finish"
- Error → "Inspect" (opens drawer scrolled to error segment)
- Finished → none (terminal)

**Sortable columns:** start time, state, runtime. Default sort: by state (attention-states first), then by start time (newest).

**No pagination.** Recent finished agents stay in the list with their muted state styling. Pruning policy is daemon-side and out of scope for this brief.

**Responsive behavior.** On narrow widths (mobile, vertical monitor below the drawer-min-width), each row collapses to a card layout: top line = state badge + key + truncated title; bottom line = runtime + tokens + action button. No horizontal scroll at any width.

## 5. Agent detail — drawer

**Open behavior.** Slides from the right on desktop. Default width ~50–60% of viewport, with a **minimum width of ~520px** so it does not feel squished on vertical monitors. On the mobile breakpoint (<768px) it becomes a full-screen sheet. Closes on Esc, browser back, click-outside, or explicit close button.

**Header** (sticky at top of drawer):

- Project · ticket key · ticket title
- Current state badge + runtime + total tokens
- Links: worktree filesystem path (with copy-to-clipboard affordance), docker stack URL (when stack is running), GitHub PR (when applicable)
- Primary action button (state-driven; mirrors the list's quick action)
- **`↗ Open as page`** button — switches to the full-page route for focused inspection

**Body** — three stacked sections:

### 5a. Token table

Sorted table: tool name · token count · share-of-total %. Compact, monospace numbers, sortable by either count or share. Replaces the architecture doc's "token-by-tool-type chart" — the user explicitly chose a sorted table over chart variants.

### 5b. State history

Compact horizontal/inline list of state transitions, e.g.:

```
Initializing (14:30) → Running (14:31) → Waiting (14:38) → Running (14:42) → PR open (14:51)
```

Click a transition to scroll the timeline below to that segment.

### 5c. Timeline (the centerpiece)

Tool-call cards grouped under collapsible **state-segment headers**. Each card is two lines:

- **Line 1** — tool name + truncated input summary (e.g. `[Bash] npm test`, `[Read] /home/x/repo/foo.ts`)
- **Line 2** — timestamp + inline token cost (e.g. `14:32:17 · 1.2k tok`)

Mirrors the CLI's existing `formatToolCall()` output (`14:32:17 [Bash][1.2k tok] npm test`) — same anatomy, richer presentation.

Clicking a card expands it to show full input/output excerpts. Edits/Writes show diff-style content; Bash shows full command + truncated output.

**Above the timeline — controls bar:**

- **Search input.** Filters tool calls by tool name, input text substring, or `error:` keyword to surface failures.
- **Live-mode toggle.** When on, the timeline pins to the bottom and auto-scrolls as new SSE events arrive (default on for active agents). When off, the user can scroll freely without being yanked. A subtle "↓ N new events" pill appears when off and new events have arrived.

## 6. New-Run flow

Triggered by the global **`+ New Run`** button in the top nav. Opens a modal/popover.

**Step 1 — Pick project.** A list (filterable when many) of registered projects.

**Step 2 — Pick ticket.** A searchable list of _open Jira tickets_ for that project. Daemon fetches and caches from Jira; no free-text fallback (picker only).

**Step 3 — Confirm.** Daemon spawns `crew run KAN-23`. Modal closes. New agent appears in the list immediately in `Initializing` state.

**`fix-pr` and `finish`** are **never** initiated from the global button — they are inline actions on existing agents (in list rows or the drawer header). When `fix-pr` needs additional input (`--from-pr` vs `--from-file` vs `--from-stdin`), it opens its own small modal at click time.

## 7. Projects route

Full-page list of registered projects (read from `~/.config/crew/projects/*.toml`).

**List view.** Each row shows: name, repo path, default branch, Jira project key, badge with count of active runs. Click → project detail.

**Project detail.** Full TOML view, read-only by default. An "Edit" button switches to a form (one field per TOML key, validated against the same zod schema the CLI uses). Save writes back to the TOML file, **preserving the `# generated by crew` header convention** (refuse to overwrite a hand-edited file lacking the header — match the CLI's behavior).

**Register new project.** A form with the required fields → writes a new `<name>.toml`.

**Remove.** A "Remove" button on each project, with a confirmation modal. Does not delete the repo or any worktrees — only the registration TOML.

## 8. Visual direction

**Personality.** Vercel-flavored: dark mode default, but **warmer than pitch-black**. Background closer to `slate-800` than `neutral-950`. Generous spacing, modern typography, subtle accent gradients/glows used sparingly to reinforce attention states (not decorative).

**No light-mode toggle in v1.** Dark only.

**Typography.**

- **UI sans** for general copy and headings (Inter or system stack — claude design's call).
- **FiraCode** for: ticket keys, file paths, tool names, token counts, transcript content, code snippets, state history. Ligatures **on**. Load via `@fontsource/fira-code` (preferred — local install, no external request) or Google Fonts CSS (acceptable fallback).

**Color palette.** Neutral dark base + the state palette as the primary chromatic system: blue (init), neutral (running), gray (idle), yellow (waiting), purple (PR), red (error), muted green (finished). **The state palette is the palette** — no extra brand accent color.

**Density.** Information-dense but breathable. Closer to Linear than Datadog. Small typography is fine; whitespace separates _sections_, not rows.

## 9. Responsive behavior

| Breakpoint                                       | Layout                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| ≥ 1280px (wide desktop)                          | Drawer ~640px wide; agent list visible alongside                                                                    |
| 768px–1279px (vertical monitor / narrow desktop) | Drawer takes ~75% width but never below ~520px; list still visible                                                  |
| < 768px (mobile)                                 | Drawer becomes full-screen sheet; list rows collapse to two-line cards; top nav simplifies (icon-only or hamburger) |

**No horizontal scroll at any width.** Mobile and vertical-monitor layouts are first-class targets, not after-thoughts.

## 10. Daemon API additions (prerequisites — not part of the visual spec)

These are out of scope for the UI design, but the dashboard depends on them. The architecture doc currently lists only read endpoints; this spec assumes the following will be added during dashboard implementation:

- `POST /jobs/run` — start `crew run` (project + ticket key)
- `POST /jobs/fix-pr` — start `crew fix-pr` (agent key + source flag)
- `POST /jobs/finish` — start `crew finish` (agent key)
- `GET /jira/:project/tickets` — proxy to Jira for the ticket picker (cached)
- `GET /agents/:key/state-history` — state transitions for §5b
- `POST /projects` / `PATCH /projects/:name` / `DELETE /projects/:name` — projects CRUD writing TOML files
- `POST /attention/clear` — clear all sticky favicon badges

Implementation plan should sequence: daemon endpoints first → dashboard surfaces second.

## 11. Non-goals (explicit)

To prevent scope creep during visual generation:

- **No multi-tenant / no auth.** Localhost only.
- **No light mode in v1.** Dark only. (Theme controls can be added later if requested.)
- **No keyboard shortcuts in v1.** Mouse/touch driven.
- **No browser notifications, no sound.** Favicon badge is the entire out-of-tab attention surface.
- **No cross-project dashboards or time-series cost analytics.** The token table per agent is the visualization surface.
- **No theming controls** (font picker, density toggle, etc.) in v1.
- **No agent-creation forms beyond the New Run flow.** All other agent shape comes from the CLI/daemon.
- **Pruning of finished agents** is a daemon concern; the UI must handle long lists gracefully but does not implement pruning UI in v1.

## 12. Hand-off notes for `claude design`

When generating the UI:

- Treat each surface in §4–§7 as an independent component family. Build the agents list, the drawer, the new-run modal, and the projects route as cleanly separable modules.
- The state palette in §3 is load-bearing — every status surface (badges, action buttons, attention indicators) should derive from the same palette tokens.
- The CLI's `formatToolCall()` line in `packages/cli/src/lib/transcripts/parser.ts:51` is the canonical anatomy for a tool-call card — keep visual fidelity to that information shape.
- Mobile layouts are not "nice to have." Build them at parity with desktop.
- Prefer real Tailwind utilities + a small handful of recipe components over a heavy component library.
