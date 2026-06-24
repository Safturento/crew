# Timeline filter-menu composites — build plan

> **For agentic workers:** this is an **interactive Figma build** (design-system work; user is the visual judge), NOT a `crew run` dispatch and NOT TDD code. Execute live in-session. Each task ends with a **visual-verification gate** — `get_metadata` for structure + `get_screenshot` compared against the shipped `Filters.tsx` render. Invoke `figma-use` before every `use_figma` call. Steps use `- [ ]` checkboxes.

**Goal:** Build `FilterRow` (set) + `FilterMenu` (collapsed + expanded) composites on the Composites page mirroring the shipped `Filters.tsx`, map them via a Code Connect doc, then relocate the 4 brainstorm frames to the Brainstorm page and refresh the snapshot.

**Architecture:** Compose from existing DS components — `FilterRow` nests the `Checkbox` set (663:869); `FilterMenu` composes `FilterRow` instances + `Pill` instances (272:120) for the header buttons. Props-over-variants for optional parts. Mapping is an inert `.figma.tsx` doc (Figma Pro — no publish).

**Tech Stack:** Figma Plugin API via `use_figma`; `crew figma-snapshot` CLI; React/TS Code Connect doc.

## Global Constraints

- **Interactive only.** Figma writes + snapshot enrichment require the live session; never dispatch via `crew run`.
- **File:** `figma_file_key = 9FeJPriqdsdA4n9R5Xsrr8`. Build on the **Composites** page.
- **Reuse, don't redraw:** `Checkbox` set `663:869` (state on/off/disabled + Label); `Pill` set `272:120` (header buttons = button-xs/idle/ghost; trigger already exists). Import/instance these — don't recreate.
- **Clear default fills:** `figma.createAutoLayout()` hardcodes opaque white on every inner frame — clear fills explicitly or the dark theme renders white. (See `~/.claude/conventions/figma.md`, safety-sweep snippet.)
- **Props over variant axes** for optional parts (BOOLEAN/TEXT/INSTANCE_SWAP) — see `feedback_figma_component_properties_over_variants`. Only `state` (FilterRow) and `tools` (FilterMenu) are variant axes.
- **Category source of truth:** `eventClassification.ts` `CATEGORIES` — order + default-visible: Conversation (on), Tools (on), Thinking (off), Hooks (off), Skills (off), System (off), Startup (on).
- **Tokens:** muted-foreground for the header label + counts; `border` token for the divider; mono font for labels/counts (10–12px) — match `Filters.tsx` classes.
- **Return all created node IDs** from each `use_figma` call; work in ≤10 logical ops per call; validate after each.

---

### Task 1: `FilterRow` COMPONENT_SET

**Files:** Figma Composites page (new COMPONENT_SET `FilterRow`).

**Interfaces:**
- Consumes: `Checkbox` set `663:869` (nested instance; its `state` + `Label`).
- Produces: `FilterRow` set — variant axis `state ∈ {on, off, disabled}`; component properties `Label` (TEXT), `Has Count` (BOOL) + `Count` (TEXT), `Has Disclosure` (BOOL) + `Expanded` (BOOL), `Indent` (BOOL). Later tasks instance this.

- [ ] **Step 1: Inspect the reference.** `get_screenshot` of brainstorm `665:864` (the popover rows) + read `Filters.tsx` `FilterRow` (lines 164–230) for exact spacing (`gap-2`, `py-1.5`, `px-2`, `pl-7` indent, count `text-[10px]`, chevron `size-3`/`size-4`). Confirm the Checkbox set's property names via `get_metadata` on `663:869`.

- [ ] **Step 2: Build the `off` variant.** Auto-layout row (HORIZONTAL, gap 8, padding `py-1.5 px-2`, counterAxis CENTER): nested `Checkbox` instance (state=off) with its `Label` exposed → a count TEXT (mono 10px, muted-foreground, hidden by default) → a disclosure chevron INSTANCE (chevron-right, size 16, hidden by default). Clear all default white fills. Return node IDs.

- [ ] **Step 3: Add `on` + `disabled` variants.** Clone to `state=on` (nested Checkbox=on) and `state=disabled` (nested Checkbox=disabled + row opacity 0.35). `combineAsVariants` into a set named `FilterRow` with axis `state`. Verify the set has exactly 3 variants via `get_metadata`.

- [ ] **Step 4: Define component properties.** On the set: `Label` (TEXT, bound to the nested Checkbox label), `Has Count` (BOOL → toggles count TEXT visibility), `Count` (TEXT), `Has Disclosure` (BOOL → toggles chevron visibility), `Expanded` (BOOL → swaps chevron-right/chevron-down via INSTANCE_SWAP or visibility pair), `Indent` (BOOL → sets left pad to `pl-7`/28px). Set sensible defaults (Has Count=false, Has Disclosure=false, Expanded=false, Indent=false).

- [ ] **Step 5: Verify (gate).** `get_screenshot` the set. Confirm: 3 state variants render (on=checked, off=unchecked, disabled=dimmed); toggling `Has Count`/`Has Disclosure`/`Indent` on a probe instance shows count/chevron/indent. Compare against `Filters.tsx` rows. Fix before proceeding.

- [ ] **Step 6: Record IDs.** Note the `FilterRow` set node ID + property names for Task 2/4.

---

### Task 2: `FilterMenu` — collapsed (base)

**Files:** Figma Composites page (new COMPONENT `FilterMenu`, or first variant of a set — see Task 3).

**Interfaces:**
- Consumes: `FilterRow` set (Task 1); `Pill` set `272:120` (header buttons).
- Produces: `FilterMenu` composite, Tools collapsed.

- [ ] **Step 1: Build the container.** Vertical auto-layout, FIXED width 288 (`w-72`), counterAxis FIXED. Clear default fills; apply the popover surface (card/background token + `border` 1px + corner radius matching the `popover` primitive). Return ID.

- [ ] **Step 2: Header.** HORIZONTAL auto-layout (padding `px-3 py-2.5`, gap 4, CENTER): "Filters" TEXT (mono 10px uppercase tracking-wide muted-foreground, layoutGrow=1) → `Pill` instance "Select all" (button-xs/idle/ghost) → `Pill` instance "Clear" (button-xs/idle/ghost). Append to container.

- [ ] **Step 3: Divider.** 1px-high fill-width RECTANGLE/frame with the `border` token. Append.

- [ ] **Step 4: Body.** Vertical auto-layout (`flex-col gap-0.5 p-2`, fill width). Append 7 `FilterRow` instances in `CATEGORIES` order with default states: Conversation=on, Tools=on (`Has Count`="5 / 11", `Has Disclosure`=true, `Expanded`=false), Thinking=off, Hooks=off, Skills=off, System=off, Startup=on. Set each instance's `Label`.

- [ ] **Step 5: Verify (gate).** `get_screenshot`. Compare to the rendered popover (`Filters.tsx` `PopoverContent`): width, header, divider, 7 rows, Tools row showing count + chevron-right, correct default checks. Fix before proceeding.

---

### Task 3: `FilterMenu` — expanded variant (Tools subtree)

**Files:** Figma Composites page (add `tools` variant axis to `FilterMenu`).

**Interfaces:**
- Consumes: `FilterMenu` collapsed (Task 2); `FilterRow` set.
- Produces: `FilterMenu` as a COMPONENT_SET with `tools ∈ {collapsed, expanded}`.

- [ ] **Step 1: Clone to `expanded`.** Duplicate the Task 2 composite. Set the Tools FilterRow instance `Expanded`=true (chevron-down).

- [ ] **Step 2: Insert the ToolsSubtree.** Directly after the Tools row, insert a representative static set of `Indent`=true `FilterRow` instances: Bash (on), Edit (on), Read (on), MCP:Jira (on), MCP:Figma (off). Add a short comment/annotation noting these are alias-derived/dynamic in code (sample only).

- [ ] **Step 3: Combine into a set.** `combineAsVariants` the collapsed + expanded frames into `FilterMenu` with axis `tools`. Verify 2 variants via `get_metadata`.

- [ ] **Step 4: Verify (gate).** `get_screenshot` both variants. Expanded shows chevron-down + indented subtree below Tools; collapsed unchanged. Fix before proceeding.

---

### Task 4: Code Connect mapping doc

**Files:**
- Create: `packages/dashboard/src/components/Timeline/Filters.figma.tsx`

- [ ] **Step 1: Read the pattern.** Read `packages/dashboard/src/components/Timeline/TranscriptRow.figma.tsx` and `TimelineSection.figma.tsx` for the established `figma.connect(...)` shape (node URL, `props` mapping, `example`).

- [ ] **Step 2: Map `FilterRow`.** `figma.connect(FilterRow_codeRef, "<FilterRow node URL>", { props: { label: figma.string('Label'), checked: figma.enum('state', { on: true, off: false, disabled: false }), disabled: figma.enum('state', { disabled: true, on: false, off: false }), count: figma.boolean('Has Count', { true: <count node>, false: undefined }), expanded: figma.boolean('Expanded'), indent: figma.boolean('Indent') }, example: ... })`. Mirror the actual prop names from Task 1.

- [ ] **Step 3: Map `FilterMenu`.** `figma.connect` the `FilterMenu` node → the `Filters`/`PopoverContent` render, example composing FilterRows over `CATEGORIES`.

- [ ] **Step 4: Verify.** `npm run lint --workspace crew-dashboard` (the `.figma.tsx` must typecheck/lint like its siblings). Confirm no `figma connect publish` is run (inert doc only — `code_connect_skipped`).

- [ ] **Step 5: Commit.** `git add packages/dashboard/src/components/Timeline/Filters.figma.tsx` + commit.

---

### Task 5: Relocate brainstorm frames → Brainstorm page

**Files:** Figma (page move, no repo files).

- [ ] **Step 1: Confirm the Brainstorm page.** `use_figma` read: list `figma.root.children` page names; resolve the existing "Brainstorm" page ID. If absent, STOP and confirm the exact page name with the user.

- [ ] **Step 2: Move the 4 frames.** Move `660:859`, `665:864`, `699:1039`, `707:1044` from Composites → Brainstorm page (`brainstormPage.appendChild(frame)` per frame; IDs are preserved). Position them clear of existing content. Return moved IDs.

- [ ] **Step 3: Verify.** `get_metadata` on the Composites page — confirm none of the 4 IDs remain; confirm they're now children of the Brainstorm page. Composites should now contain only real components + the new FilterRow/FilterMenu.

---

### Task 6: Refresh snapshot + finish

**Files:** `.crew/figma-snapshot/**`

- [ ] **Step 1: Run `figma-snapshot-refresh`.** Full export (`crew figma-snapshot`) → compact enrich per batch → `crew figma-snapshot --enrich` (the CREW-283 flow). New nodes (FilterRow, FilterMenu) get captured; the 4 moved frames drop out.

- [ ] **Step 2: Verify fresh.** `crew figma-snapshot --check` → expect **fresh** (the unstable scratch frames are gone). Confirm `index.json` contains `FilterRow` + `FilterMenu` and no `Brainstorm —`/`reference` entries.

- [ ] **Step 3: Commit + PR.** Commit `.crew/figma-snapshot/` + `Filters.figma.tsx` (if not already) on a branch; open a PR. Run `agents-doc-parity-check` (`.agents/design-system.md` may reference the composite inventory).

## Self-Review

- **Spec coverage:** FilterRow set (T1); FilterMenu collapsed (T2) + expanded (T3); Code Connect mapping (T4); brainstorm relocation (T5); snapshot refresh + fresh `--check` (T6). Reuse of Checkbox/Pill (T1/T2 constraints). All spec sections covered.
- **Placeholder scan:** node URLs/IDs in T4 are intentionally resolved at build time from the just-created composites (T1–T3 record them) — not content gaps. Sample tool-subtree rows are explicitly "representative static," per spec.
- **Consistency:** `state {on,off,disabled}` and the prop names (`Label`, `Has Count`/`Count`, `Has Disclosure`/`Expanded`, `Indent`) are used identically across T1, T2, T4. `tools {collapsed,expanded}` consistent T2/T3. Category order/defaults match the spec + `eventClassification.ts`.
