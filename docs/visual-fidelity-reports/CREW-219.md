# visual-fidelity-check report — 2026-06-04

**Branch:** CREW-219
**Base:** main
**Touched components:** `FixPrModal.tsx` (new), `AgentRow.tsx` (+ their `.test.tsx`, not analyzed), `App.tsx` (wiring, no Figma surface)
**Findings:** 0 high, 0 medium, 0 low — 2 verification gaps (both expected/known)

## Summary

CREW-219 (Task T7) adds the **Fix PR comment modal**: a `pr_open` agent gains a
`Fix PR` QuickAction that opens a modal with a comment textarea; submit enqueues
a `fix_pr` action carrying the comment. Both touched UI surfaces are **net-new
and have no Figma reference**:

- **`FixPrModal`** was never designed — the Figma snapshot has `Modal`,
  `AlertModal`, `RegisterModalContent`, and the three `NewRunStep*Content`
  frames, but **no Fix-PR modal**. So the gate verifies it composes the
  _designed_ DS primitives faithfully, not a pixel match to a screen reference.
- **The `Fix PR` button on `AgentRow`** is an additive action not present in the
  `AgentRow` Figma component-set (`212:910`), whose `pr_open` variant predates
  T7. It reuses the **exact variant of the adjacent `Finish` button**.

## Structural check (Step 3)

### `FixPrModal` — composed from designed primitives

| Element        | Code                                                                                                                         | Designed reference                                                                                                                                             | Verdict                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Shell          | `<Modal title={`Fix PR — ${key}`}>`                                                                                          | `Modal` composite (`355:238`), used unmodified                                                                                                                 | ✓ match                |
| Field label    | `text-[11px] font-normal text-muted-foreground uppercase`                                                                    | identical to `FormField`'s label (`337:234`)                                                                                                                   | ✓ match                |
| Textarea       | `border-input bg-transparent dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50` | identical token set to `Input` (`318:230`), minus the fixed height (multiline `rows={5}`, `resize-y`)                                                          | ✓ match                |
| Cancel button  | `<Button color="running" intensity="mid" size="sm">`                                                                         | identical to `AlertModal`'s Cancel (`373:413`, shipped composite)                                                                                              | ✓ match                |
| Primary button | `<Button color="running" intensity="loud" size="sm">`                                                                        | `AlertModal`'s action is `intensity="loud"`; color is `running` (not the destructive `error` default) because Fix PR is **constructive**, not a delete-confirm | ✓ semantically correct |

The snapshot's modal composites (`AlertModal`, `Modal`) do not expose their
inner button variants (flattened in the enriched tree), so the button reference
is taken from the **shipped composite source** (`AlertModal.tsx`), which is the
Code-Connect-mapped designed component.

### `AgentRow` — `Fix PR` reuses the `Finish` variant

```tsx
// pr_open case — the new button sits between View PR and Finish:
<Button
  color="running"
  intensity="ghost"
  size="sm"
  className={gateClass}
  onClick={fire('fix-pr')}
  {...gate}
>
  Fix PR
</Button>
```

Identical `color`/`intensity`/`size` to the sibling `Finish` button in the same
variant. The `AgentRow` set (`212:910`) uses `ghost`/`mid`/`loud` Pill
intensities; the secondary row actions are `ghost`. The new button matches that
exactly — the only divergence from Figma is its _presence_ (3 actions vs the
design's 2), which is the net-new feature itself.

## Caller check (Step 4)

- `FixPrModal` has one caller — `App.tsx`, which passes `agentKey`, `open`,
  `onOpenChange`, `onSubmit`. On submit it enqueues
  `{ kind: 'fix_pr', project, ticketKey, comment }`. No variant props to
  mismatch.
- `AgentRow`'s new button forwards `onAction('fix-pr', agent)`; `App.tsx` maps
  `fix-pr` → open modal (not a direct enqueue, since a comment is required
  first). Gated on `runnerOnline` exactly like `Resume`/`Finish`.
- **Icons:** no icon on either the `Fix PR` row button or the modal buttons —
  consistent with the sibling `Finish` (text-only ghost). No icon finding.

## Live render check (Step 5) — via Playwright MCP

chrome MCP was the prescribed tool for Step 5 but its browser would not
auto-start (see Verification gaps). As in the CREW-212 report, **Playwright MCP**
covered the live check against the running app at `:27023`:

- On the `pr_open` agent (CREW-102), the row renders `View PR · Fix PR · Finish`;
  `Fix PR` and `Finish` are visually identical ghost text buttons — confirming
  the shared variant.
- Clicking `Fix PR` (after a `runner.status_changed{online:true}` inject)
  opens the modal titled **"Fix PR — CREW-102"** with the close `X`, an
  uppercase `COMMENT` label, the textarea, and `Cancel` + `Fix PR` buttons —
  matching the `Modal` composite anatomy (header border, `bg-slate-950`, rounded
  `14px`).
- Submit is disabled until a non-empty comment exists; on submit the modal
  closes and `POST /api/actions` returns **201** with body
  `{"kind":"fix_pr","project":"crew","ticketKey":"CREW-102","comment":"…"}`.

Screenshot captured during the run (modal filled) confirmed the dark-theme DS
styling renders correctly.

## Verification gaps

- **No Figma reference for either touched surface.** `FixPrModal` is undesigned
  and the `AgentRow` `Fix PR` action is net-new — there is no screen- or
  component-level pixel reference to diff against. The gate verified composition
  against the shipped, Code-Connect-mapped DS primitives instead. _If a Fix-PR
  modal frame is later added to the Crew Figma file, re-run the gate against it._
- **chrome MCP browser would not auto-start** on port 9223 (`Chrome did not
become ready … within 15000ms`) despite the MCP server resolving cleanly
  (`/tmp/crew-mcp-CREW-219.log` shows no wiring warnings) and `browser_mode`
  reporting a running pid. Step 5's chrome-driven computed-style check was
  covered by Playwright MCP (live DOM + network + screenshot) instead. Logged as
  a followup (`docs/followups.md` → "2026-06-04 — chrome MCP browser fails to
  auto-start on port 9223 in crew dispatches").
