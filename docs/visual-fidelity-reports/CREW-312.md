# visual-fidelity-check report — 2026-07-02

**Branch:** CREW-312
**Base:** main
**Touched components:** `SupervisorDrawer` (Controls + Reconcile sections added); the Runner-page composites (`SupervisorCard`, `ProcessRow`, `FailedStartCard`, `RunDrawer`, + section wrappers) were **deleted**, not restyled.
**Findings:** 0 high, 0 medium, 2 low (both verification gaps, neither blocks).

## Method

- **Figma reference:** the canonical drawer composite is `SupervisorDrawerBody` `882:1216` (Composites page, in `.crew/figma-snapshot`) — but that node predates the reconcile roll-up. The design for the new Controls + Reconcile sections is the **Brainstorm-page** frame `899:1887` ("OPTION 2 — reconciliation in supervisor drawer"), which is **not** in the on-disk snapshot (config covers Composites + Dashboard Screens only). Fetched its token data live via the Figma MCP (`get_metadata` + `get_variable_defs`).
- **No `.figma.tsx`:** `SupervisorDrawer` ships no Code Connect mapping by design (the project publishes no Code Connect — see `.agents/design-system.md`). Verified against the reference nodes directly.
- **Structural** (live `get_variable_defs` on `900:1680` Controls + `900:1693` Reconcile) + **visual** (live render via Playwright MCP at the worktree dashboard).

## Structural check — PASS

Bound-variable comparison (Figma `resolvedHex` → code variant):

| Element               | Figma (`get_variable_defs`)                           | Code                                                   | Verdict |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ------- |
| Controls · Restart    | `state/idle` (#64748b)                                | `<Button color="idle" intensity="muted" size="sm">`    | ✓ match |
| Controls · Stop       | `state/error` (#f87171)                               | `<Button color="error" intensity="muted" size="sm">`   | ✓ match |
| Reconcile · Dequeue   | `state/idle` (#64748b) family (queued)                | `<Button color="idle" intensity="muted" size="xs">`    | ✓ match |
| Reconcile · Reap      | `state/waiting` (#fbbf24) family (orphaned)           | `<Button color="waiting" intensity="muted" size="xs">` | ✓ match |
| Reconcile list bg     | `slate-1100` (#172134)                                | `bg-slate-1100`                                        | ✓ match |
| Reconcile reason text | "queued · not yet claimed" / "orphaned · no live PID" | `RECONCILE_REASON` constant, verbatim                  | ✓ match |
| Header + Copy + log   | unchanged from CREW-292 (`882:1216`)                  | untouched JSX (rewrap only)                            | ✓ n/a   |

The status pill, Copy button, breadcrumb header, and management-log console are carried over unchanged from CREW-292's verified pass — this PR only rewraps their container (`gap-5` outer + a flex-col log wrapper) and adds the two sections above them.

## Visual check — PASS

Rendered the drawer live (runner chip → drawer) and screenshotted: `crew / runner` breadcrumb, `Supervisor` title + status `Badge`, a Controls row, `RECONCILE · 1` with the queued `CREW-1` ref (reason + project + relative time) and its `Dequeue CREW-1` button, then `MANAGEMENT LOG` with the enriched reap lines. Layout, spacing, and section order match `899:1887`.

## Verification gaps (low)

1. **Reference lives on a non-snapshotted page.** `899:1887` is a Brainstorm-page exploration, so its enriched per-instance data (exact pill `intensity`) isn't on disk. Colors were read live and match; the `intensity="muted"` choice for the pills was inferred from the reference's subtle-surface look, not read from an enriched instance. Low risk — `muted` is the established intensity for secondary row actions across the DS.
2. **Online Controls not exercised live.** The seeded worktree runner reported offline, so the live render showed the cold-`Start supervisor` control; the online `Restart` + `Stop` pair (the design's depicted state) is covered by the unit test but not the live screenshot.

Neither gap blocks. Both surfaced in the PR description.
