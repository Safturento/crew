# visual-fidelity-check report — 2026-06-24

**Branch:** CREW-279
**Base:** main
**Touched components (under `componentDir`):** 2 — `NewRunModal.tsx` (rewritten step 2), `ModalSelectionRow.tsx` (added `disabled` prop) + `NewRunModal.figma.tsx`
**Figma references:** composite `362:2212` (`NewRunStep2Content`) / screen `1:3418` (Select Ticket); confirm screen `9:2`
**Findings:** 0 high, 0 medium, 0 low · 1 verification note (live picker rendered via mocked route — see below). Discharges the CREW-137 deferred modal-composite visual-fidelity verification.

## Summary

CREW-279 turns the New Run modal's step 2 from a free-text ticket-key field into a searchable,
epic-grouped, dependency-aware Jira ticket picker, and adds a Title row to the confirm step. The
picker is built entirely from existing DS primitives (`Input`, `Switch`, `ModalSelectionRow`,
`Badge`, `Button`, `Stepper`) wired to the new `DaemonClient.listProjectTickets`. Structural +
caller checks pass against composite `362:2212`; the live render matches the Figma screen.

## Structural check

Compared the rendered picker against composite `362:2212` enrichment + screenshot:

- **Header row** — "Pick a ticket · KAN" left, `Switch` + "Available only" label right-aligned
  (Figma `811:1174` Switch `state=off`, muted-foreground label). ✓
- **Search** — `Input` with `leadingIcon={<Search/>}` (lucide/search) + placeholder "Filter open
  tickets…" (Figma `319:1615` Input `Icon=lucide/search`, `Has Icon=true`). ✓
- **Epic header** — key-prefixed, uppercase, `tracking-wide`, muted; the KEY is a blue underlined
  link (`text-blue-400 underline underline-offset-2`). Parent-less → "Ungrouped". ✓
- **Rows** — `ModalSelectionRow` `primary`=KEY, `secondary`=summary, `meta`=blocker hint (blocked
  rows only), badge = priority / running. Matches the six row instances (`351:23xx`). ✓
- **Priority badge color** (Figma screenshot is authoritative — the plan sketch used a single
  `finished` color): High→`error` (red-400), Medium→`waiting` (amber-400), Low→`initializing`
  (blue-400), running overlay→`running` (slate-400), all `intensity="mid"`. Verified against the
  composite screenshot (High red / Medium amber / Low blue / running slate). ✓
- **Disabled rows** — blocked + in-flight rows render `<button disabled>` with `opacity-50` +
  `cursor-not-allowed` (Figma blocked/running rows dim to opacity-50). ✓
- **Back button** — `Button color="running" intensity="mid" size="sm"` + ArrowLeft (Figma
  `278:1458` Pill `type=button-sm, color=running, intensity=mid`). ✓
- **Confirm step (`9:2`)** — adds the Title `SummaryRow` carrying the selected ticket's summary;
  Project / Ticket / Title / Worktree / Command rows + Back / Spawn agent. ✓

## Caller check

`NewRunModal` (the caller of the DS primitives) and `TicketList` pass variants matching the Figma
instances above. `ModalSelectionRow`'s new `disabled` prop is the only contract addition; it both
dims (opacity-50) and renders the row as a disabled `<button>` so the blocked/in-flight states are
non-interactive. No caller-side variant mismatches.

## Visual check (live, Playwright MCP)

Rendered all three states in the live dashboard at `http://localhost:26367`. Because the daemon
tickets route ships in the sibling ticket (CREW-278, not yet merged into this worktree's base), the
live `HttpDaemonClient` 404s `/api/projects/:slug/tickets`; the picker was rendered by fulfilling
that request with a fixture payload mirroring the Figma composite. Picker list, blocked/Ungrouped
row, and the confirm-step Title row all matched the Figma references pixel-for-pixel.

**Bug caught + fixed during live verification:** the app-wide `QueryClient` sets `throwOnError:
true` + default retry, so a tickets *fetch error* (the 404 here, or any transient non-2xx in
production) bubbled to the dashboard error boundary ("Something went wrong") instead of degrading
the modal to manual ticket-key entry. Fixed by opting the picker's queries out of both
(`throwOnError: false`, `retry: false`) and added a regression test that reproduces the production
config. Re-verified live: the modal now degrades gracefully to manual entry while the rest of the
dashboard renders normally.

## Verification gaps

- The live picker was rendered against a mocked tickets response, not the real daemon route — the
  end-to-end live render against CREW-278's route lands when this PR merges after it (the plan's
  stated T1 → T2 → T3 merge order). The structural + caller checks are unaffected (they compare
  code to the Figma snapshot, no network needed).
- No `.crew/visual-fidelity.json` config is present (the snapshot exists at `.crew/figma-snapshot`).
  Used the dispatch-provided values (`componentDir=packages/dashboard/src/components`,
  `dashboardUrl=http://localhost:26367`). Project-wiring nit, not blocking this ticket.
