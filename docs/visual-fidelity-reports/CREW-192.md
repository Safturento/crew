# visual-fidelity-check report — 2026-05-23

**Branch:** CREW-192
**Base:** main
**Touched components:** Pill (via PillBase), Tag, TranscriptRow (caller)
**Findings:** 0 high, 0 medium, 1 low (1 pre-existing-design-intent, 0 from this PR)

## Summary

CREW-192 adds a new `toolColor` axis to `PillBase` / `Tag` and wires it into
`TranscriptRow`'s `tool_use` branch via a new `event-palette.ts` lookup that
maps aliased tool names to a 15-entry `TOOL_COLOR_CLASSES` palette
(`packages/dashboard/src/data/tool-colors.ts`).

The spec (`docs/superpowers/specs/2026-05-23-crew-192-tool-palette-design.md`)
explicitly scopes tool-color as a **code-only** refinement. The Figma `Pill`
component set (node `272:120`) carries an 8-value `color` variant axis
(`idle | initializing | running | waiting | pr-open | error | finished | white`)
— **none of the 14 tool families are mirrored in Figma**, and the spec calls
this out under "Out of scope":

> New Figma variants for the 15 tool colors (Pill stays at 8 state colors in
> Figma; tool colors are code-only refinement)

The existing state-color rendering (state badges, error pills, category-default
pills for non-tool rows) is unchanged. The `toolColor` axis is strictly
additive — when omitted, `pillSurfaceClasses` falls through to the existing
`STATE_CLASSES` lookup, so every previously-mapped Figma variant continues to
render identically.

## High-severity findings

None.

## Medium-severity findings

None.

## Low-severity findings / verification gaps

### Finding 1: TranscriptRow.figma.tsx example renders tool-color in code but state-color in Figma

- **Kind:** caller / verification gap (pre-existing design intent, not a regression)
- **File(s):** `packages/dashboard/src/components/Timeline/TranscriptRow.figma.tsx:14-35`
- **Code:** The example threads a `Bash` `tool_use` through the component:
  ```tsx
  content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: {...} }]
  ```
  With CREW-192 wired up, the rendered Tag now uses
  `text-amber-300 bg-amber-950/40 border-amber-500/60` (per
  `TOOL_COLOR_CLASSES.bash`) instead of the prior
  `text-amber-400 bg-amber-1050 border-amber-500` (per
  `STATE_CLASSES.waiting`).
- **Figma reference:** Pill set `272:120`, `color` axis variants:
  `idle | initializing | running | waiting | pr-open | error | finished | white`
  — no `bash` / `edit` / etc. variants exist.
- **Diff:** The Figma reference still renders `Tag color="waiting"` (amber-400
  solid). The code now renders the tool's specific shade (amber-300 + alpha).
- **Disposition:** Intentional per spec — Figma intentionally stays at the
  8 state-color palette; tool colors are a code-only refinement. The Tag /
  Pill `color` axis is unchanged; `toolColor` is a separate, additive axis
  with no Figma counterpart. No fix required.
- **Surface in PR description:** yes (the spec already does, but the report
  should reiterate so reviewers don't perceive a regression).

## Verification gaps

- **No Figma reference for the 15 tool-color variants.** Per spec, intentional.
  If a future ticket mirrors these in Figma (e.g. as a `tool-color` variant
  axis on the Pill set), `tag.figma.tsx` / `button.figma.tsx` /
  `badge.figma.tsx` will need to expose `toolColor` via `figma.enum`.
- **`tool-colors.ts` has no `.figma.tsx`.** Data modules don't get one; the
  parity contract is at the consuming component (Tag) level, not the data
  module.

## Structural check — token resolution

`TOOL_COLOR_CLASSES` follows the same shape as `STATE_CLASSES`
(text / bg / border / solidBg / solidBorder). Each entry's Tailwind class
strings are static literals so the v4 JIT picks them up at build time.
Verified by `npm run build --workspace=crew-dashboard` and direct grep
against the produced CSS bundle:

```
text-amber-300, text-blue-300, text-cyan-300, text-emerald-300,
text-fuchsia-300, text-green-300, text-indigo-300, text-lime-300,
text-pink-300, text-sky-300, text-slate-300, text-slate-400,
text-teal-300, text-violet-300
```

…plus matching `bg-*-950 / bg-slate-800` and `border-*-500 / border-slate-600`
families — all 15 palette entries land in the bundle.

## Caller check — TranscriptRow

`packages/dashboard/src/components/Timeline/TranscriptRow.tsx` Row component:

```tsx
const tagColorProps =
  spec.tone === 'error'
    ? { color: 'error' }
    : spec.toolColor
      ? { toolColor: spec.toolColor }
      : { color: CATEGORY_COLOR[spec.category] };
// ...
<Tag {...tagColorProps} intensity="mid" data-testid="transcript-row-tag">
```

- `tone === 'error'` → `color="error"` (Figma state-color override, red).
  Matches Figma's error treatment; unchanged.
- `spec.toolColor` set → `toolColor=...` (NEW, code-only).
- Otherwise → falls back to `CATEGORY_COLOR[spec.category]`, the 5-category
  state-color map (`conversation: running`, `tools: waiting`, `thinking:
  pr_open`, `hooks-and-skills: initializing`, `system: idle`). Unchanged.

`spec.toolColor` is populated only inside the `tool_use` branch:

```tsx
if (isToolUse(block)) {
  const alias = toolAlias(block.name);
  return {
    ...
    tagLabel: alias,
    toolColor: colorForTool(alias),
    ...
  };
}
```

Non-tool rows (`tool_result`, `text`, `thinking`, `system`, `attachment`)
leave `toolColor` undefined and continue to render with their existing
category state-color. Confirmed visually in the running dashboard at
`http://localhost:18998/#/agent/CREW-102`:

| Row tag (label, tone)         | data-color | className surface                                                |
| ----------------------------- | ---------- | ---------------------------------------------------------------- |
| Assistant (text)              | `running`  | `text-slate-400 bg-slate-1050 border-slate-500` (unchanged)      |
| Result (tool_result, default) | `waiting`  | `text-amber-400 bg-amber-1050 border-amber-500` (unchanged)      |
| Read (tool_use)               | `read`     | `text-slate-300 bg-slate-800/40 border-slate-500/60` (NEW)       |
| Grep (tool_use)               | `grep`     | `text-violet-300 bg-violet-950/40 border-violet-500/60` (NEW)    |
| TodoWrite (tool_use)          | `todoWrite`| `text-sky-300 bg-sky-950/40 border-sky-500/60` (NEW)             |
| Edit (tool_use)               | `edit`     | `text-green-300 bg-green-950/40 border-green-500/60` (NEW)       |
| Bash (tool_use)               | `bash`     | `text-amber-300 bg-amber-950/40 border-amber-500/60` (NEW)       |
| Write (tool_use)              | `write`    | `text-emerald-300 bg-emerald-950/40 border-emerald-500/60` (NEW) |

All 6 tools surfaced in the CREW-102 fixture render distinct colors per the
spec palette. Errors continue to override with red regardless of tool color
(asserted by the `error tool_result still renders red` test in
`TranscriptRow.test.tsx`).

## Decision

Zero high-severity findings, zero medium. The single low-severity item is
intentional design divergence between code and Figma (tool-color is
deliberately code-only per spec). **Proceed to PR.**
