# visual-fidelity-check report — 2026-06-19

**Branch:** CREW-245
**Base:** main
**Touched components:** Row, AgentRow, TopNav, runner/{SupervisorCard, ProcessRow, FailedStartCard, FailedToStartSection, LiveProcessList, UnmanagedRuns, QueuedActions, RecentlyEnded, ViewOutputModal, CommandBadge, Section}, RunnerPage
**Findings:** 0 high, 2 medium, 4 low — all **fixed in-scope** (caller-side variant corrections)

The Runner page was checked against the Figma source of truth: Runner Page `775:3715`, composites SupervisorCard `789:1190`, ProcessRow `767:1179`, FailedStartCard `771:1142`, ViewOutputContent `774:1150`. Variant data read from each composite's `enrichment.componentInstances`.

## Findings (all fixed)

All findings were **caller-side variant mismatches** — the component emitted the right structure but a call site passed a Pill `color`/`intensity` that diverged from the Figma instance. Each was corrected to match the enriched `componentProperties`.

| # | Sev | Component | Was | Figma (enrichment) | Fix |
|---|-----|-----------|-----|--------------------|-----|
| 1 | med | ProcessRow Cancel | `error/mid` | `type=button-sm, color=error, intensity=muted` (767:1179) | `intensity="muted"` |
| 2 | med | SupervisorCard Restart | `running/mid` | `color=idle, intensity=muted` (789:1190) | `color="idle" intensity="muted"` |
| 3 | low | SupervisorCard Stop | `error/mid` | `color=error, intensity=muted` (789:1190) | `intensity="muted"` |
| 4 | low | ProcessRow Pause | `running/ghost` | `color=idle, intensity=ghost` (767:1179) | `color="idle"` |
| 5 | low | FailedStartCard Archive | `running/ghost` | `color=idle, intensity=ghost` (771:1142) | `color="idle"` |
| 6 | low | CommandBadge | `bg-muted / text-muted-foreground` | `command` tag = slate-1100 fill + state/idle (#64748B) text | `bg-slate-1100 text-slate-500` |

## Confirmed matches (no finding)

- Row accent tints: FailedStartCard `error` → red-1050 bg + red-500 border + pulse (771:1142 fills `#262031` red-1050, stroke `#EF4444` red-500); UnmanagedRuns `waiting` → amber-1050 + amber-500.
- Status pills: ProcessRow running→`running` (slate-400 #94A3B8), launching→`initializing`, cancelling→`waiting` (amber-400 #FBBF24); SupervisorCard running→`running`, down→`error`; failed→`error`; queued/idle→`idle`.
- Force kill `error/loud` (767:1179) ✓; Inspect `error/mid` (771:1142) ✓; Reap `waiting/muted`, Dequeue `idle/ghost`, PR `pr-open/mid` (775:3715) ✓.

## Visual check (Step 5, chrome/Playwright MCP)

Rendered the live page at `localhost:22351/#/runner`. The live daemon happened to carry real data (supervisor `down`, one live process `BRUNO-RUNNER-1`, four derived Unmanaged runs), so every wired section rendered populated. Section stack, accents, pill colors, and the cancel-confirm AlertModal all match the Figma. Screenshot retained in the run artifacts.

## Verification gaps

- Failed-to-start / Queued / Recently-ended sections render fully from fixtures (component tests) but had no live data on the merged daemon (no read endpoint yet — see `docs/followups.md`), so their populated states were verified via component tests + the Figma composites, not the live DOM.
- Supervisor Restart/Stop/Start render disabled in v1 (no daemon control route); their resting variant matches Figma but the enabled/hover states weren't exercised live.
