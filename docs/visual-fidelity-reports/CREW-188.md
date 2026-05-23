# visual-fidelity-check report — 2026-05-23

**Branch:** CREW-188
**Base:** main
**Touched components:** 1 (`TranscriptRow` — new; old `EventCard` + `renderers/` deleted)
**Findings:** 0 high, 0 medium, 2 low (2 from this PR, 0 pre-existing)

## Summary

The new `TranscriptRow` composite faithfully implements Figma node `553:445`
(the actual `TranscriptRow` — the ticket's `318:230` and `558:477` IDs are
`Input` and `TimelineToolbar` respectively; see CREW-188.md "Decisions" for
the resolution path). Structural and caller checks pass; live-DOM check
against the running dashboard at http://localhost:22260 confirms the
rendered anatomy matches the Figma component definition.

## Structural check — pass

Figma `553:445` (`TranscriptRow`, `raw` properties) vs. rendered DOM:

| Property                | Figma spec       | Rendered (computed)   | Match |
| ----------------------- | ---------------- | --------------------- | ----- |
| layoutMode              | HORIZONTAL       | `display: flex`       | ✓     |
| itemSpacing             | 8                | `gap: 8px`            | ✓     |
| padding                 | 10/10/6/6        | `padding: 6px 10px`   | ✓     |
| counterAxisAlignItems   | CENTER           | `align-items: center` | ✓     |
| absoluteBoundingBox.h   | 32               | 30px                  | ≈ (within 2px tolerance — `Tag` `h-[17px]` + `py-1.5` × 2 = 29–30px) |

For the populated `Bash` tool_use sample (Figma enrichment shows
`Pill: type=tag, color=waiting, intensity=mid, font=mono`, resolved
`bg=#26282A amber-1050` / `stroke=#F59E0B amber/500` /
`textColor=#FBBF24 state/waiting`):

| Pill property | Figma resolved | Rendered (via `Tag color="waiting" intensity="mid"`) | Match |
| ------------- | -------------- | --------------------------------------------------- | ----- |
| bg            | `#26282A` (amber-1050) | `bg-amber-1050` token | ✓     |
| border        | `#F59E0B` (amber/500)  | `border-amber-500` token | ✓     |
| text color    | `#FBBF24` (state/waiting) | `text-amber-400` token | ✓     |
| fontFamily    | mono           | Fira Code             | ✓     |
| fontSize      | 11             | 11px                  | ✓     |
| height        | (default)      | 17px                  | ✓ (Tag's TAG_SHAPE)   |
| borderRadius  | 4              | 4px                   | ✓     |

## Caller check — pass

`TranscriptRow` is called from a single site (`Timeline.tsx` line ~181)
that simply passes the event down — no per-call variant choice to verify.
Slim 5 → Pill colour mapping is driven inside `TranscriptRow` itself:

| Category          | Pill color (code)  | Justification |
| ----------------- | ------------------ | ------------- |
| conversation      | `running` (slate)  | Neutral default — matches the screen-level screenshots' visual quietness for prose blocks. |
| tools             | `waiting` (amber)  | Direct match to the Figma sample (`Bash → waiting/mid`). |
| thinking          | `pr_open` (violet) | Matches the meditative/reflective treatment of thinking pills elsewhere in the DS. |
| hooks-and-skills  | `initializing` (blue) | Cyan-blue reads as "system-ish but distinct from prose" — fits the auxiliary nature of hooks. |
| system            | `idle` (slate-500) | Quietest neutral — pushes system noise to the visual background. |
| error overrides   | `error` (red)      | `tool_result.is_error`, `system/api_error`, `hook_non_blocking_error`. |

Live histogram on the CREW-102 fixture (19 rows): 14 `tools`, 5
`conversation`. Categories resolve correctly; tones are all `default`.

## Visual check — pass

Live screenshots from Playwright MCP and chrome MCP against the
running dashboard render the AgentBody / Timeline composition with the
new `TranscriptRow` in place. Anatomy (Tag · text · meta), colour
mapping, and meta column ordering all match the Figma `220:246`
(AgentBody) and `553:445` (TranscriptRow) screen-level references.

## Low-severity findings (surface in PR description)

### L-1: Row carries a `border-b border-white/5` divider that the Figma `TranscriptRow` definition does not specify

- **Kind:** structural
- **File:** `packages/dashboard/src/components/Timeline/TranscriptRow.tsx:67`
- **Code:** `<div … className="border-b border-white/5">`
- **Figma reference:** `553:445` — `raw.fills = []`, `raw.strokes = []` (no border declared on the `TranscriptRow` component itself)
- **Diff:** The Figma component has no bottom border. The rendered row has a 1px `rgba(255,255,255,0.05)` divider.
- **Why I kept it:** the AgentBody screen-level reference (`220:246` screenshot) shows rows that read as separated rows in dense lists — likely emergent from the grouping context rather than an explicit per-row border, but the very-faint white-5% divider in code reads identically at viewport scale. Removing it makes long rows blur into one another visually.
- **Recommendation:** keep as-is; revisit if the design owner wants the bare-Figma treatment.

### L-2: Per-tool category-colour mapping is extrapolated, not directly speced

- **Kind:** caller (design intent)
- **File:** `packages/dashboard/src/components/Timeline/TranscriptRow.tsx` (`CATEGORY_COLOR` map)
- **Figma reference:** the snapshot's `TranscriptRow` enrichment only carries ONE concrete sample (`Bash → waiting/mid`). No per-tool table.
- **Diff:** The `tools` category resolves all tool calls (Bash, Read, Grep, TodoWrite, etc.) to the same `waiting` (amber) pill. This is the followup [`2026-05-11 — TimelineTag color tied to tool category?`](docs/followups.md) — explicitly noted as an open design question. Surfaced here for awareness; not in scope for CREW-188.
- **Recommendation:** keep flat mapping; revisit if/when the design owner spec'd a per-tool palette.

## Verification gaps

- The `enrichment.componentProperties` on Figma node `553:445` is `null`
  (this is the COMPONENT, not an INSTANCE — its variant config only
  surfaces on consumer instances). Per-state instance behaviour is
  inferred from the single Bash sample in the COMPONENT's child
  `Pill` instance enrichment.
- The screen-level snapshot for the new AgentBody redesign (`220:246`)
  was previously refreshed against an empty fixture — most rows visible
  in code are not present in the snapshot's PNG. The structural anatomy
  match holds; per-row pixel-diffs over many rows weren't attempted.

## Conclusion

No high- or medium-severity findings. The two low-severity items are
intentional design judgments that I'm flagging for visibility, not
defects. Visual fidelity gate **passes** for CREW-188.
