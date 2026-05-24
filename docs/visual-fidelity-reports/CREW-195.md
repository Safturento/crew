# visual-fidelity-check report — 2026-05-23

**Branch:** CREW-195
**Base:** main
**Touched components:** TokensByTool, TokenBarRow, AgentBody (model pass-through)
**Findings:** 0 high, 1 medium (deliberate scope-extension), 0 low
**Verification gaps:** Figma snapshot predates the CREW-195 cost column

## High-severity findings

None.

## Medium-severity findings

### Finding 1: TokensByTool Figma reference (577:643) predates the Cost column

- **Kind:** structural (deliberate scope extension)
- **File(s):** `packages/dashboard/src/components/TokensByTool.tsx:111-149`,
  `packages/dashboard/src/components/TokenBarRow.tsx:32`
- **Code:** Grid is now `grid-cols-[1fr_auto_3fr_auto_auto]` with a fifth Cost
  column; rows render `formatCost(weightedTokenCost(model, bucket))` plus a
  `title=` per-category breakdown; footer adds a grand total cost cell.
- **Figma reference:** node `577:643` (Composites → TokensByTool). Snapshot
  shows a 4-column grid: Tool / Tokens / Bar / Share. No Cost column. Card
  fill `card → slate/900 (#0F172A)`, border `border → slate/800 (#1E293B)` —
  both still match the code output (no token drift).
- **Diff:** the rendered panel is a strict super-set of the Figma — every
  existing element (header labels, row bars, share %, footer total) lines up
  pixel-for-pixel with the snapshot; the new Cost column is appended at the
  right and an extra cost total appears in the footer row.
- **Fix:** extend the Figma `TokensByTool` component to include the Cost
  column, then refresh `.crew/figma-snapshot/composites/577-643.{json,png}`
  via `crew figma-snapshot`. Tracked as a followup under [CREW-189](https://safturento.atlassian.net/browse/CREW-189) — the Epic owns the
  Figma↔code reconciliation for the drawer polish series.

## Low-severity findings / judgment calls

None.

## Verification gaps

- **Figma snapshot at `577:643` is from the pre-CREW-195 Composites page**
  (captured 2026-05-22, before this work). Structural / caller / token
  comparisons against the existing 4 columns all pass; the new Cost column
  has no Figma counterpart yet. Surfacing this so the gap isn't silently
  treated as "passed."

## What was checked

- **Structural:** the 4 existing columns + footer match Figma's slate token
  bindings (`card → slate/900`, `border → slate/800`).
- **Caller:** `AgentBody.tsx` passes `model={data.model}` through; falls back
  to Sonnet pricing when empty (covered by `pricing.test.ts`).
- **Visual smoke:** rendered against CREW-102 fixture in the live dashboard
  (`http://localhost:25863/#/agent/CREW-102`). Per-row cost cells render
  `$0.0017 … $0.02`, the panel footer shows the grand total `$0.06`, and
  the cost-cell `title=` exposes `input X · output Y · cache-write Z ·
  cache-read W` as specified.
- **e2e:** `tests/e2e/agent-drawer-redesign.spec.ts` adds an explicit
  regression for the cost cells + grand total + tooltip shape against a
  mocked detail response.
