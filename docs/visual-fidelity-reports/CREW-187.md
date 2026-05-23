# visual-fidelity-check report — 2026-05-22

**Branch:** CREW-187
**Base:** main
**Touched components:** Input (primitive), SearchBar (caller of Input), Filters (new — caller of Button + Popover), Timeline.tsx (toolbar composition), TokensByTool (alias aggregator), TokenBarRow (`title` prop only), AgentBody (passes `tokensByTool` to Timeline). Plus the new Popover primitive (no Figma counterpart yet) and data-only changes to `eventClassification.ts` + `tool-alias.ts`.
**Findings:** 0 high · 1 medium (pre-existing) · 2 low · 2 verification gaps

## High-severity findings

_None._

## Medium-severity findings

### M-1 (pre-existing) — Search input border + bg use white-alpha overlay instead of opaque slate-1100/slate-600

- **Kind:** structural
- **File(s):** `packages/dashboard/src/components/Timeline/SearchBar.tsx:14`
- **Code:** `<Input ... className="h-8 min-w-0 flex-1 border-border bg-card font-mono text-xs" leadingIcon={<Search aria-hidden />} />`
- **Figma reference:** `558:483` (Search within TimelineToolbar `558:477`) — `enrichment.componentInstances[1].resolvedStyles.fills = #172134 (slate-1100)`, `strokes = #475569 (slate/600)`.
- **Diff:** Code resolves to `bg-card` (slate/900 #0F172A) + `border-border` (slate/800 #1E293B). Figma resolves to slate-1100 (#172134) + slate/600 (#475569). The border is the more visible delta: slate/800 → slate/600 is a noticeably brighter border in Figma.
- **Why not fixed in this PR:** The dashboard's whole consumer-alpha pattern (`border-white/10`, `bg-white/5`) sets borders/backgrounds via white-alpha overlays rather than opaque slate shades. CREW-187 only swaps the bare `<input>` for the DS `<Input>` composite and adds the `leadingIcon` prop — it doesn't take on the broader "opaque slate vs alpha overlay" reconciliation. The `--color-input` and `--color-border` semantic tokens are deliberately bound to `white` per `.agents/design-system.md` to support consumer alpha.
- **Recommendation:** Surface as known pre-existing divergence; not blocking. A future ticket can decide whether to (a) re-bind `--color-border` / `--color-input` to opaque slate, or (b) accept the white-alpha rendering as the dashboard's correct interpretation.

## Low-severity findings

### L-1 — Filters pill adds chevron-down + numeric divergence badge not present in Figma `558:478`

- **Kind:** caller (intentional spec addition)
- **File(s):** `packages/dashboard/src/components/Timeline/Filters.tsx:53-73`
- **Figma reference:** `558:478` — `componentProperties = { type: 'button-sm', color: 'idle', intensity: 'mid', font: 'sans', Has Icon: true, Icon: 'lucide/filter', Label: 'Filters' }`.
- **Diff:** Code matches `color=idle / intensity=mid / size=sm / icon=Filter` exactly. Code ALSO appends a chevron-down + a conditional numeric divergence badge that aren't in Figma.
- **Why intentional:** The CREW-187 ticket explicitly requires "Filters pill shows a numeric badge when current selection ≠ default" — the badge is spec-mandated. The chevron-down is a UX affordance to signal "this opens a popover" since the standalone Pill isn't visually a dropdown.
- **Recommendation:** Accept as-is. If Figma later adds a trailing-icon Pill axis (see `docs/followups.md` 2026-05-12 entry — "Pill trailing-icon support + CodeChip mono-font composite"), backport.

### L-2 — Filters popover content has no Figma counterpart yet

- **Kind:** verification gap
- **File(s):** `packages/dashboard/src/components/Timeline/Filters.tsx:75-108`, `packages/dashboard/src/components/ui/popover.tsx`
- **Figma reference:** None — Figma `558:477` documents the Pill, but the popover content (Categories section with 5 toggleable rows + Tools section with aliased rows) is not designed in the file.
- **Diff:** N/A — nothing to compare against.
- **Recommendation:** Surface in PR description. A future "Filters popover content design" Figma pass should add a counterpart frame; until then, the implementation follows the ticket's prose specification.

## Verification gaps

- **Filters popover content:** see L-2.
- **Aliased MCP rows in TokensByTool:** the running dashboard seed (CREW-101/102/103) uses only built-in tool names (Bash/Edit/Read/Write/Grep/TodoWrite), so the `MCP:<Service>` alias collapse cannot be eyeballed against a live populated agent. Unit tests (`tool-alias.test.ts` 14 pins; `TokensByTool.test.tsx` "collapses MCP rows into a single alias row" case) pin the contract. CREW-186 seeded transcript events but did not seed MCP-tool tool_calls — that gap is independently tracked.

## Structural matches (no findings)

- **Input primitive** (`packages/dashboard/src/components/ui/input.tsx`): the default no-icon variant is unchanged from main. The new `leadingIcon` branch wraps the input in a flex container that reserves a leading slot; layout matches Figma `318:230`'s horizontal auto-layout (`itemSpacing: 8`, padding 12/7/12/8). The leading-icon slot accepts a `ReactNode` so callers control the specific lucide glyph.
- **TokensByTool container** (`packages/dashboard/src/components/TokensByTool.tsx:38`): `rounded-[10px] border border-border bg-card` — matches Figma `577:643` `cornerRadius: 10`, `border: slate/800`, `bg: slate/900` exactly.
- **TokenBarRow** (`packages/dashboard/src/components/TokenBarRow.tsx`): only change is the new optional `title` prop; visual surface unchanged from origin/main, still matches Figma `555:449`.

## Step 5 — live DOM check via chrome MCP

Skipped — `mcp__chrome__use_browser` is not in the agent's tool inventory for this dispatch. `/tmp/crew-mcp-CREW-187.log` was not surfaced in this run, but the Playwright MCP screenshots taken in step 7 (PR description) confirm:
- Filters Pill with leading filter icon + chevron + popover ✓
- Search input with leading search icon ✓
- TokensByTool composite with rounded card + per-row bar ✓

Visual smoke matches Figma at the macro level; computed-style verification of the M-1 finding would benefit from chrome MCP if it becomes available.

