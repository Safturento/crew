# visual-fidelity-check report — 2026-06-04

**Branch:** CREW-218
**Base:** main
**Touched components:** `NewRunModal.tsx` (+ `NewRunModal.test.tsx` not analyzed, `NewRunModal.figma.tsx` mapping), `App.tsx` (caller wiring)
**Findings:** 0 high, 2 medium (both intentional, deferred), 1 low (accepted), 0 from-PR defects

## Summary

CREW-218 (T6) wires the **New Run** stepper modal — the first live consumer of
the CREW-137 modal composites. It composes already-Figma-verified DS pieces
(`Modal` `355:238`, `Stepper` `378:462`, `ModalSelectionRow` `350:236`,
`FormField` `337:234`, `Badge`/`Button` from the `Pill` set), so the gate
verifies (a) the modal assembles those composites with the props the Figma
frames use, and (b) the rendered three steps match the screen references
`1:2980` (Select Project), `1:3418` (Select Ticket), `9:2` (Confirm).

Checked against the on-disk snapshot `.crew/figma-snapshot/` (step composites
`362:2211` / `362:2212` / `362:2213` enrichment + the screen frames) and the
live app at `:24590` via Playwright MCP screenshots + chrome MCP DOM eval.

## Structural / caller check — per step

- **Step 1 (Pick a project) vs `362:2211` / `1:2980`:** match. Stepper
  `active=1`; one `ModalSelectionRow` per project with `primary=name`,
  `secondary=repoPath`, `meta=jiraKey`, `Show Badge=true` — exactly the
  enrichment's `componentPropertyOverrides` (`Primary: "kanban-api"`,
  `Secondary: "~/code/kanban-api"`, `Meta: "KAN"`). Live render confirms.
- **Step 3 (Confirm) vs `362:2213` / `9:2`:** match on the Figma-populatable
  rows + buttons. Back = `Pill button-sm color=running intensity=mid` "← Back"
  (leading arrow); Spawn = `Pill button-sm color=white intensity=loud`
  "Spawn agent →" (trailing arrow). See the fixed-this-PR note below.

### Fixed this PR — trailing-arrow placement on Next / Spawn

The first cut used the `Button` `icon` prop (a **leading** slot in `PillBase`),
so "Spawn agent" / "Next" rendered with the arrow on the **left**, but Figma
`362:2213` shows `Label: "Spawn agent →"` with the arrow **trailing**. Fixed by
moving `<ArrowRight>` into the button children (after the label); "← Back" keeps
the leading slot, matching Figma. Confirmed in the live DOM (chrome MCP) +
screenshot: child order is `text · svg` for Spawn/Next, `svg · text` for Back.

## Medium — intentional, deferred (surfaced, not blocking)

### M1: Step 2 is a ticket-key text entry, not the open-ticket picker

- **Kind:** structural / visual
- **File:** `packages/dashboard/src/components/NewRunModal.tsx` (step 2)
- **Figma reference:** `1:3418` / `362:2212` — a searchable list of open
  tickets (`Input` `Icon: lucide/search`, `Placeholder: "Filter open tickets…"`
  - `ModalSelectionRow`s like `Primary: "KAN-31"`, priority badge).
- **Diff:** code renders a single `FormField` ("Ticket key") + a `Next →`
  button (Figma advances by clicking a ticket row, so has no Next).
- **Root cause / decision:** no daemon endpoint serves open tickets to the
  dashboard; plan T6 step 2 explicitly defers live ticket fetching to v-next.
  Tracked in `docs/followups.md` (anchor
  `2026-06-04--new-run-modal-step-2-is-a-text-entry-not-the-figma-open-ticket-picker`).

### M2: Confirm step omits the "Title" row

- **Kind:** visual
- **File:** `NewRunModal.tsx` (step 3 `SummaryRow`s)
- **Figma reference:** `9:2` — confirm rows include `Title` (the ticket
  summary). Code shows Project / Ticket / Worktree / Command.
- **Root cause / decision:** same as M1 — no ticket-summary source in v1.
  Same followup. Worktree + Command are derived locally from project data, so
  those rows do match Figma.

## Low — accepted

### Back/Next/Spawn use lucide SVG arrows vs Figma's Unicode-in-label

- **Kind:** caller (icon primitive)
- **Figma reference:** `362:2213` Back/Spawn pills use `Has Icon=false` with the
  arrow as a Unicode char inside the label (`"← Back"`, `"Spawn agent →"`).
- **Diff:** code renders real `lucide` `ArrowLeft` / `ArrowRight` SVGs.
- **Decision:** **accept.** Project convention is the `Button` `icon`/children
  SVG slot, not Unicode glyphs in text (cf. the resolved 2026-05-13 "Close
  button uses Unicode ✕ instead of lucide/x" followup — SVG is the _preferred_
  direction here). Placement now matches Figma; the glyph primitive is the
  cleaner choice.

## Verification gaps

- `.crew/visual-fidelity.json` is absent; proceeded against the present
  `.crew/figma-snapshot/` (index + per-node enrichment), which carried all the
  data the checks needed. Flag for wiring the config block, not a blocker.
- `NewRunModal.figma.tsx` maps to the screens-file frame `1:2980` (the flow),
  not a Composites-page component — Code Connect maps one node, and the modal
  owns the whole stepper. The per-step composites (`362:221x`) were used as the
  fidelity references instead.
