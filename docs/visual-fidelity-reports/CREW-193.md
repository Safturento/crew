# visual-fidelity-check report — 2026-05-23

**Branch:** CREW-193
**Base:** main
**Touched components:** 1 — `packages/dashboard/src/components/Timeline/TranscriptRow.tsx`
**Figma reference:** node `553:445` (Composites › TranscriptRow), snapshot at `.crew/figma-snapshot/composites/553-445.{png,json}`
**Findings:** 0 high, 0 medium, 3 low (all pre-existing or intentional new functionality)

## Summary

CREW-193 introduces three new visual behaviors that have no counterpart in the committed Figma snapshot: line-clamp-3 wrapping, a reserved-space chevron, and a 300px-capped expansion pre. The Figma snapshot (captured 2026-05-22) predates the CREW-193 design and shows a single-line, no-chevron TranscriptRow. The divergences are expected and tracked as low-severity gaps for the next snapshot refresh.

All CREW-192 palette wiring (per-tool color on Tag + chevron) renders correctly against the post-CREW-192 dashboard implementation; CREW-192 already shipped, and CREW-193 only consumes its `TOOL_COLOR_CLASSES` module.

## Structural check (live DOM vs Figma node 553:445)

Confirmed via Playwright MCP DOM inspection of the Bash tool_use row on the CREW-102 fixture (`#/agent/CREW-102`):

| Property | Figma `raw` / `enrichment` | Live render | Match |
|---|---|---|---|
| `paddingLeft/Right` | 10 | `padding: 6px 10px` | ✓ |
| `paddingTop/Bottom` | 6 | `padding: 6px 10px` | ✓ |
| `itemSpacing` | 8 | `columnGap: 8px` | ✓ |
| Layout `counterAxisAlignItems` | CENTER | `align-items: flex-start` | divergent (intentional, see Low #1) |
| Tag text font | Fira Code 11px | `font-family: "Fira Code"; font-size: 11px` | ✓ |
| Tag fill (`amber-1050` per Figma `enrichment.componentInstances[0].resolvedStyles`) | `#26282A` | `amber-950/40` via CREW-192 palette | divergent (CREW-192 lineage, see Low #2) |
| Tag stroke (`amber/500`) | `#F59E0B` | `amber-500/60` via CREW-192 palette | divergent (CREW-192 lineage, see Low #2) |
| Text font / size | Fira Code 12px | `font-family: "Fira Code"; font-size: 12px` | ✓ |
| Meta font / size | Fira Code 12px | matches | ✓ |
| Chevron | not in Figma | reserved 14px lucide ChevronRight/Down | new feature, see Low #3 |

## Caller check

Only one caller: `packages/dashboard/src/components/Timeline/Timeline.tsx:240`

```tsx
<TranscriptRow key={eventKey(event)} event={event} />
```

`TranscriptRow` is variant-free at the call site (props derive entirely from the `event`). No caller-side changes were needed for CREW-193; no caller findings.

## Low-severity findings

### Finding 1 — `items-start` instead of `items-center` (intentional)

- **Kind:** structural (intentional new behavior)
- **File:** `packages/dashboard/src/components/Timeline/TranscriptRow.tsx:175`
- **Code:** `className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left"`
- **Figma reference:** node `553:445` has `counterAxisAlignItems: "CENTER"`
- **Diff:** trigger row top-aligns its children (tag/text/meta/chevron) instead of vertically centering. For short single-line content, the Tag and meta are visually 1-2px higher than the Figma reference.
- **Reason:** When the oneliner wraps to 2–3 lines via `line-clamp-3`, top-alignment keeps the Tag/meta/chevron anchored to the first line of text — `items-center` would cause them to drift downward as the text grew. Mitigated by `mt-0.5` on Tag/meta/chevron for a 2px tight alignment with the first line.
- **Recommendation:** track in the next Figma snapshot refresh; surface in PR description.

### Finding 2 — Tag fills/strokes use CREW-192 palette opacities (pre-existing)

- **Kind:** structural (pre-existing, lineage = CREW-192)
- **File:** `packages/dashboard/src/data/tool-colors.ts` (already merged)
- **Live values:** `bg-amber-950/40`, `border-amber-500/60`, `text-amber-300`
- **Figma reference:** `amber-1050` solid + `amber/500` solid, text `state/waiting` (#FBBF24 = amber-400)
- **Diff:** the snapshot was captured pre-CREW-192 (palette landed 2026-05-23 evening, snapshot taken 2026-05-22). CREW-192's tonal `/40` + `/60` opacities give a softer pill than the flat fills the snapshot shows.
- **Recommendation:** not in CREW-193 scope. The next `figma-snapshot-refresh` will pick up the new per-tool palette swatches.

### Finding 3 — chevron not present in Figma snapshot (new feature)

- **Kind:** structural (new feature)
- **File:** `packages/dashboard/src/components/Timeline/TranscriptRow.tsx:204-211`
- **Code:**
  ```tsx
  <span data-testid="transcript-row-chevron" aria-hidden
    className={cn('mt-0.5 shrink-0', chevronColorClass, !showChevron && 'invisible')}>
    {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
  </span>
  ```
- **Figma reference:** node `553:445`'s `componentPropertyDefinitions` declares Pill + text + timestamp + tokens; no Icon/Chevron property.
- **Diff:** the chevron is brand-new in CREW-193 and renders as `lucide/chevron-right` or `lucide/chevron-down` at `size-3.5` (14px). Color follows the row's `toolColor` per CREW-192 palette; falls back to `text-muted-foreground` for non-tool rows; renders red on error rows.
- **Recommendation:** track in the next Figma snapshot refresh — TranscriptRow component should gain an `expand-chevron` slot (always-reserved with `invisible` for layout-shift prevention).

## Verification gaps

- **Snapshot is pre-CREW-193 / pre-CREW-192.** No live `enrichment` data exists for the new chevron slot — none of the chevron-color decisions can be cross-checked against Figma. Verified manually via DOM inspection: Read=slate-300, Grep=violet-300, TodoWrite=sky-300, Result/text=muted-foreground (all match `TOOL_COLOR_CLASSES`).
- **No `mcp__chrome__use_browser` Step 5 visual diff against Figma screenshot.** The Figma screenshot at `composites/553-445.png` shows a single 32px-tall row with no chevron, so a direct overlay comparison would only restate Findings #1–#3. Live multi-line behavior verified via direct DOM measurement instead.

## Decision

No high-severity findings. The three low-severity items are all intentional CREW-193 new behaviors or pre-existing CREW-192 lineage; they should be folded into the next `figma-snapshot-refresh` rather than gating this PR.

**Proceed.**
