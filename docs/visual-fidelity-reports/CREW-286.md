# visual-fidelity-check report — 2026-06-25

**Branch:** CREW-286
**Base:** main
**Touched components (under `componentDir`):** 3 — `TicketRow.tsx` (new), `NewRunModal.tsx` (uses `TicketRow`; `interactive` filter; `width={620}`), `Modal.tsx` (new optional `width` prop)
**Figma references:** composite `362:2212` (`NewRunStep2Content`, 620px frame) / `TicketRow` set `861:1134` / screen `1:3418` (Select Ticket)
**Findings:** 0 high, 0 medium, 0 low · 1 verification note (live picker rendered via mocked route; `TicketRow` has no `.figma.tsx`, checked at the composite level).

## Summary

CREW-286 replaces the picker's single-line `ModalSelectionRow` ticket rows with a two-row,
title-led `TicketRow`, and folds the `interactive` Jira-label flag (CREW-285) into the
disabled/filter logic. The summary is the bold wrapping primary; a muted mono meta line carries
`# KEY` plus a tinted status reason; the priority `Badge` stays top-right. The modal widens to
620 (matching the `NewRunStep2Content` frame) via a new optional `Modal` `width` prop.

## Structural check

Compared the rendered `TicketRow` against the `TicketRow` set (`861:1134`) enrichment + the
`362:2212` screenshot:

- **Row surface** — `bg-card` (#0F172A), `border-border` (#1E293B), title `text-foreground`
  (#E2E8F0): exact match to the TicketRow instance `resolvedStyles` (`card` / `border` /
  `foreground`). ✓
- **Title** — `font-semibold text-foreground`, wraps (no truncate); the meta line sits below it
  (`flex-col`). Long title wraps to two lines without overflow. ✓
- **Meta line** — `font-mono text-xs text-muted-foreground` (#94A3B8); leading `#` is the
  `lucide/Hash` icon (`size-3`), matching the `AgentRow` key treatment. ✓
- **Tinted reason** (precedence **blocked > interactive > running**) — blocked → `text-amber-400`
  (`STATE_CLASSES.waiting`), interactive → `text-violet-400` (`pr_open`), running →
  `text-slate-400` (`running`). Matches the composite screenshot's amber / violet / slate reasons. ✓
- **Priority badge** — `Badge intensity="mid"` top-right; High→`error` (red-400), Medium→`waiting`
  (amber-400), Low→`initializing` (blue-400), neutral fallback `idle`. Preserves the CREW-279 map
  verified against the same composite. ✓
- **Disabled rows** — `!runnable || hasActiveAgent || interactive` → `opacity-50` +
  `cursor-not-allowed`, rendered as a disabled `<button>` (Figma dims the blocked/running/
  interactive rows via layer opacity; same mechanism). ✓
- **Modal width** — `Modal width={620}` → DialogContent `style={{ width: 620 }}`, matching the
  620px `NewRunStep2Content` frame; default stays 560 for all other modal callers. ✓
- **List scroll cap** — raised `max-h-72` → `max-h-[28rem]` so ~7 rows show before scroll. ✓

## Caller check

`NewRunModal` / `TicketList` render `<TicketRow ticket onSelect />` per ticket and fold
`|| t.interactive` into both the disabled set and the "Available only" filter predicate.
`ModalSelectionRow` now backs only the step-1 project rows; the per-ticket `running` `Badge` is
gone — "running" surfaces as the tinted meta reason instead. No caller-side variant mismatches.

## Visual check (live, Playwright MCP)

Rendered the live picker at `http://localhost:29444`. The worktree daemon's Jira list returns
`available:true` with no Ready tickets, so the tickets route was fulfilled with a fixture mirroring
the Figma KAN composite (runnable / in-flight / interactive / blocked rows across two epics +
Ungrouped). The rendered rows matched the Figma screenshot 1:1: two-row title-led layout, wrapping
long title, `# KEY` + tinted reasons (running slate, interactive violet, blocked amber), priority
badges (High red / Medium amber / Low blue), dimmed disabled rows, widened modal. Toggling
"Available only" hid the in-flight, interactive, and blocked rows (and their now-empty groups),
leaving only the runnable rows.

## Verification gaps

- `TicketRow` has no `.figma.tsx` (it is a feature sub-component of `NewRunStep2Content`, like
  `FixPrModal` it stays out of the Code-shipped-composites table). Verified at the composite level
  (`362:2212`) instead — the TicketRow instances are captured in that node's enrichment.
- The live picker was rendered against a mocked tickets response (worktree daemon has no Ready
  tickets), not the real daemon route. Structural + caller checks compare code to the on-disk
  snapshot and are unaffected.
- No `.crew/visual-fidelity.json` config present (snapshot exists at `.crew/figma-snapshot`). Used
  the dispatch-provided values (`componentDir=packages/dashboard/src/components`,
  `dashboardUrl=http://localhost:29444`). Project-wiring nit, not blocking this ticket.
