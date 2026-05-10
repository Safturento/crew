# Fidelity Vertical Slices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Two-phase plan, one phase per ticket.** Phase A = CREW-119 (Agents list); Phase B = CREW-117 (Agent drawer). Run Phase A first — it builds the shared `StateBadge` composite + adds the state-color semantic tokens to Crew DS. After Phase A merges, dispatch Phase B.

**Goal:** Implement the vertical slice work for two existing fidelity tickets (CREW-117 + CREW-119), bundling Crew DS composite buildout + dashboard refactor + Figma frame migration + the original visual fidelity sweep into each ticket.

**Architecture:** Per `docs/superpowers/specs/2026-05-10-fidelity-vertical-slices-design.md`. Each ticket builds the Crew DS composites its screen needs, refactors the dashboard code to consume shadcn primitives where applicable, migrates the Figma frame (color binding + Crew DS instance swap from CREW-126's deferred followups), then does the original fidelity sweep. The architectural framing — Core (forked shadcn kit) → Crew DS (override layer + composites) → Crew Dashboard Screens — is settled by `docs/superpowers/specs/2026-05-09-design-system-bootstrap-design.md`.

**Tech Stack:** Figma MCP (`use_figma`, `get_metadata`, `get_screenshot`, `get_design_context`), Tailwind v4 (`@tailwindcss/vite` + CSS-first `@theme`), shadcn/ui primitives in `packages/dashboard/src/components/ui/`, `@figma/code-connect` (mapping files only — publish skipped per `project_code_connect_skipped` memory), React 19, CVA, lucide-react.

**Spec reference:** `docs/superpowers/specs/2026-05-10-fidelity-vertical-slices-design.md`
**Project config reference:** `docs/plans/design-system.md` (Crew DS state, Core kit notes, file URLs)

---

## File Structure

### Modified code files

| File | Change | Phase |
|---|---|---|
| `packages/dashboard/src/index.css` | Add 7 state-color CSS variables to `@theme` block (mirror the Crew DS additions); reuse existing `--color-state-*` values that survived CREW-122 token migration | A |
| `packages/dashboard/src/components/StateBadge.tsx` | Refactor to consume `state/*` token classes (e.g. `bg-state-running`) via the new `@theme` entries; use shadcn-style CVA structure | A |
| `packages/dashboard/src/components/AgentRow.tsx` | Replace inline `<button>` markup with `<Button variant="ghost" size="sm">` from shadcn primitive | A |
| `packages/dashboard/src/components/TopNav.tsx`, `BrandMark.tsx`, `AgentsList.tsx`, `ProjectSection.tsx` | Spot-fix any inline shadcn-replaceable patterns surfaced during the fidelity sweep | A |
| `packages/dashboard/src/components/AgentBody.tsx`, `StateHistoryBar.tsx`, `TokenTable.tsx`, `ViewportFrame.tsx` | Spot-fix any inline shadcn-replaceable patterns | B |

### New code files

| File | Purpose | Phase |
|---|---|---|
| `packages/dashboard/src/components/TopNav.figma.tsx` | Code Connect mapping for Crew DS TopNav → dashboard TopNav | A |
| `packages/dashboard/src/components/BrandMark.figma.tsx` | Code Connect mapping | A |
| `packages/dashboard/src/components/AgentRow.figma.tsx` | Code Connect mapping | A |
| `packages/dashboard/src/components/StateBadge.figma.tsx` | Code Connect mapping | A |
| `packages/dashboard/src/components/ProjectSection.figma.tsx` | Code Connect mapping | A |
| `packages/dashboard/src/components/AgentsList.figma.tsx` | Code Connect mapping | A |
| `packages/dashboard/src/components/AgentBody.figma.tsx` | Code Connect mapping | B |
| `packages/dashboard/src/components/StateHistoryBar.figma.tsx` | Code Connect mapping | B |
| `packages/dashboard/src/components/TokenTable.figma.tsx` | Code Connect mapping | B |
| `packages/dashboard/src/components/ViewportFrame.figma.tsx` | Code Connect mapping | B |

### Modified docs

| File | Change | Phase |
|---|---|---|
| `docs/plans/design-system.md` | Append a `## Component inventory` section (or extend existing) listing each new Crew DS composite with its Figma node ID, dashboard counterpart path, and `.figma.tsx` mapping path. Update Status table row for Phase 4. Add the 7 state-color semantic tokens to the Crew DS section. | A + B |

### Figma deliverables

| Deliverable | File | Phase |
|---|---|---|
| 6 new Crew DS composite components (TopNav, BrandMark, AgentRow, AgentsList, StateBadge, ProjectSection) | Crew DS file (`DsA7QuEa2WthDATkksd1Bq`) | A |
| 7 new state-color semantic tokens added to `Crew / Semantic Colors` collection | Crew DS file | A |
| `Agents List (/)` frame migrated (color binding + Crew DS instance swap) | Crew Dashboard Screens (`9FeJPriqdsdA4n9R5Xsrr8`) | A |
| 4 new Crew DS composite components (AgentBody, StateHistoryBar, TokenTable, ViewportFrame) | Crew DS file | B |
| `Agents List (/) - Agent Drawer Open` + `Agent Page (/agent/XXX-123/full)` frames migrated | Crew Dashboard Screens | B |

---

## Phase A — CREW-119 — Agents list vertical slice

### Task A.1: Read context

**Files:** None (read-only).

- [ ] **Step 1:** Read the spec: `docs/superpowers/specs/2026-05-10-fidelity-vertical-slices-design.md` end-to-end.
- [ ] **Step 2:** Read `docs/plans/design-system.md` (project config + current Crew DS state).
- [ ] **Step 3:** Read the dashboard components that map to this slice:
  - `packages/dashboard/src/components/TopNav.tsx`
  - `packages/dashboard/src/components/BrandMark.tsx`
  - `packages/dashboard/src/components/AgentRow.tsx`
  - `packages/dashboard/src/components/StateBadge.tsx`
  - `packages/dashboard/src/components/ProjectSection.tsx`
  - `packages/dashboard/src/components/AgentsList.tsx`
- [ ] **Step 4:** Read the existing `index.css` `@theme` block to capture the current `--color-state-*` OKLCH values:

```bash
grep -A1 'color-state' packages/dashboard/src/index.css
```

- [ ] **Step 5:** Read the design hand-off README for the Agents list section:
  - `docs/designs/design_handoff_crew_dashboard_v2/README.md` (filter to Agents-list-relevant sections)

### Task A.2: Add state-color semantic tokens to Crew DS

**Files:** None (Figma-only). Crew DS file: `DsA7QuEa2WthDATkksd1Bq`.

The dashboard's `index.css` defines 7 state colors:
- `--color-state-initializing: oklch(0.7 0.16 250)` (blue)
- `--color-state-running: oklch(0.78 0.005 260)` (neutral-light)
- `--color-state-idle: oklch(0.65 0.01 260)` (neutral-mid)
- `--color-state-waiting: oklch(0.82 0.16 90)` (amber)
- `--color-state-pr-open: oklch(0.72 0.16 295)` (purple)
- `--color-state-error: oklch(0.7 0.16 25)` (red)
- `--color-state-finished: oklch(0.72 0.096 150)` (green)

These need to graduate into Crew DS as semantic tokens.

- [ ] **Step 1:** Discover which Tailwind primitive in Core's `tw/colors` is closest to each state color. Run a `use_figma` script against Core (`UkPJj6vd7HMKcey7M0XF4N`) that lists all `tw/colors` variables + their OKLCH values. Match each state color to the closest primitive (e.g. `state-error` ~ red shade with similar L+C+H).

```js
// use_figma against Core file
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const twColors = cols.find(c => c.name === "tw/colors");
const vars = await Promise.all(twColors.variableIds.map(id => figma.variables.getVariableByIdAsync(id)));
const defaultModeId = twColors.modes[0].modeId;
return vars.map(v => ({
  name: v.name,
  key: v.key,
  rgb: v.valuesByMode[defaultModeId],
}));
```

- [ ] **Step 2:** Map each state color to a primitive (record this mapping for the next step):

| State | OKLCH | Approx Tailwind primitive (verify via Step 1 output) |
|---|---|---|
| initializing | 0.7 0.16 250 | `blue/500` |
| running | 0.78 0.005 260 | `slate/400` |
| idle | 0.65 0.01 260 | `slate/500` |
| waiting | 0.82 0.16 90 | `amber/400` |
| pr-open | 0.72 0.16 295 | `violet/500` |
| error | 0.7 0.16 25 | `red/500` |
| finished | 0.72 0.096 150 | `emerald/500` |

(Adjust based on Step 1's actual primitives — pick the closest by L distance first, then chroma + hue.)

- [ ] **Step 3:** Write a `use_figma` script against Crew DS to add 7 new variables to `Crew / Semantic Colors`. Each new variable aliases to the matching Core primitive in BOTH `light mode` and `dark mode` (single primitive per state — no light/dark variants for state colors at this stage).

```js
// Pattern; populate the names + corePrimitiveKeys from Step 2 mapping
const STATES = [
  { name: "state/initializing", coreKey: "<key>" },
  { name: "state/running", coreKey: "<key>" },
  // ...etc
];

const cols = await figma.variables.getLocalVariableCollectionsAsync();
const semantic = cols.find(c => c.name === "Crew / Semantic Colors");
const lightId = semantic.modes.find(m => /light/i.test(m.name)).modeId;
const darkId = semantic.modes.find(m => /dark/i.test(m.name)).modeId;

const created = [];
for (const s of STATES) {
  const corePrimitive = await figma.variables.importVariableByKeyAsync(s.coreKey);
  const v = figma.variables.createVariable(s.name, semantic, "COLOR");
  v.scopes = ["FRAME_FILL", "SHAPE_FILL", "STROKE_COLOR", "TEXT_FILL", "EFFECT_COLOR"];
  v.setValueForMode(lightId, { type: "VARIABLE_ALIAS", id: corePrimitive.id });
  v.setValueForMode(darkId, { type: "VARIABLE_ALIAS", id: corePrimitive.id });
  created.push(v.id);
}
return { createdNodeIds: created };
```

- [ ] **Step 4:** Verify count via `get_metadata` — `Crew / Semantic Colors` should now have 55 variables (was 48; +7).

- [ ] **Step 5:** No code commit yet (Figma-only; final commit comes at end of Phase A).

### Task A.3: Build Crew DS BrandMark component (warm-up)

**Files:** None (Figma-only).

`BrandMark` is the simplest composite — a sized SVG/text logo. Build first as a smoke test for the per-component recipe.

- [ ] **Step 1:** Read `packages/dashboard/src/components/BrandMark.tsx` to capture variants (likely just `size`).

- [ ] **Step 2:** Identify the visual: navigate the Crew Dashboard Screens file (`9FeJPriqdsdA4n9R5Xsrr8`), find the brand mark inside the `Agents List (/)` frame's TopNav (top-left corner). Take a screenshot for reference.

- [ ] **Step 3:** Find clear space in the Crew DS file (`DsA7QuEa2WthDATkksd1Bq`) on a new `Composites` page. Write a `use_figma` script:

```js
// Create a Composites page if not present
let page = figma.root.children.find(p => p.name === "Composites");
if (!page) {
  page = figma.createPage();
  page.name = "Composites";
}
await figma.setCurrentPageAsync(page);

// Find clear x position
let maxX = 0;
for (const child of page.children) maxX = Math.max(maxX, child.x + child.width);

// Build the BrandMark component (vector path or text for the placeholder)
const cmp = figma.createComponent();
cmp.name = "BrandMark";
cmp.x = maxX + 200;
cmp.y = 0;
cmp.resize(120, 32);
// Add the actual visual content (text or vector) — match the dashboard's BrandMark
// ...
return { createdNodeIds: [cmp.id] };
```

Build the component to match what the dashboard renders (load fonts as needed via `figma.loadFontAsync` — Hanken Grotesk + Fira Code are the canonical fonts).

- [ ] **Step 4:** Take `get_screenshot` of the new component vs the reference from Step 2. Confirm visual match.

- [ ] **Step 5:** Author `packages/dashboard/src/components/BrandMark.figma.tsx`:

```tsx
import { figma } from "@figma/code-connect";
import { BrandMark } from "@/components/BrandMark";

figma.connect(BrandMark, "https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System?node-id=<id>", {
  example: () => <BrandMark />,
});
```

(Replace `<id>` with the actual node ID from the script return.)

- [ ] **Step 6:** Run typecheck — confirm the new `.figma.tsx` doesn't break type-checking:

```bash
npm run -w crew-dashboard typecheck
```

Expected: PASS.

- [ ] **Step 7:** Commit the `.figma.tsx` file:

```bash
git add packages/dashboard/src/components/BrandMark.figma.tsx
git commit -m "feat(dashboard): Code Connect mapping for BrandMark (CREW-119)"
```

### Task A.4: Build Crew DS TopNav component

**Files:**
- Create: `packages/dashboard/src/components/TopNav.figma.tsx`

- [ ] **Step 1:** Read `packages/dashboard/src/components/TopNav.tsx` for variants and structure.

- [ ] **Step 2:** Take reference screenshot from `Agents List (/)` frame's top nav region.

- [ ] **Step 3:** Build the TopNav Crew DS component on the Composites page. It should compose:
  - The BrandMark instance (from Task A.3)
  - Nav links (Agents, Projects, etc.) bound to Crew DS color tokens (`foreground` for active, `muted-foreground` for inactive)
  - Action buttons (e.g. "+ New Run") using the shadcn Button instance from Core

Use semantic Crew DS tokens for all colors; Core's `tw/space` / `tw/padding` for spacing.

```js
// Pattern (script body — adjust per actual design)
const cmp = figma.createComponent();
cmp.name = "TopNav";
cmp.layoutMode = "HORIZONTAL";
cmp.primaryAxisAlignItems = "SPACE_BETWEEN";
cmp.counterAxisAlignItems = "CENTER";
// ... bind padding to a tw/space variable, fill to `card` semantic, etc.
return { createdNodeIds: [cmp.id] };
```

- [ ] **Step 4:** Verify with `get_screenshot`; compare to reference.

- [ ] **Step 5:** Author `TopNav.figma.tsx`. If TopNav has variant props (e.g. active route highlight), map them via `figma.enum`.

- [ ] **Step 6:** Run typecheck.

- [ ] **Step 7:** Commit:

```bash
git add packages/dashboard/src/components/TopNav.figma.tsx
git commit -m "feat(dashboard): Code Connect mapping for TopNav (CREW-119)"
```

### Task A.5: Build Crew DS StateBadge component (shared with Phase B)

**Files:**
- Create: `packages/dashboard/src/components/StateBadge.figma.tsx`

- [ ] **Step 1:** Read `packages/dashboard/src/components/StateBadge.tsx`. Capture the CVA variant config — should map to the 7 agent states (running/error/waiting/etc.).

- [ ] **Step 2:** Reference: state pills appear throughout the agents list. Take screenshots of each state variant from the design hand-off.

- [ ] **Step 3:** Build StateBadge as a Component Set in Crew DS with one variant per state (variant property `state` with values `running | error | waiting | pr-open | finished | initializing | idle`). Each variant binds:
  - `fill` to the matching `state/*` semantic token from Task A.2
  - Text to a high-contrast token (likely `foreground` for dark backgrounds, `background` for light)

```js
// Pattern: build one component per state, then combineAsVariants
const states = ["running", "error", "waiting", "pr-open", "finished", "initializing", "idle"];
const components = [];
for (const state of states) {
  const c = figma.createComponent();
  c.name = `state=${state}`;
  // ... bind fill to `state/${state}` Crew DS variable
  components.push(c);
}
const set = figma.combineAsVariants(components, page);
set.name = "StateBadge";
return { createdNodeIds: [set.id] };
```

- [ ] **Step 4:** Verify with `get_screenshot`; check each variant renders the right color.

- [ ] **Step 5:** Author `StateBadge.figma.tsx`:

```tsx
import { figma } from "@figma/code-connect";
import { StateBadge } from "@/components/StateBadge";

figma.connect(StateBadge, "https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System?node-id=<id>", {
  props: {
    state: figma.enum("state", {
      "running": "running",
      "error": "error",
      "waiting": "waiting",
      "pr-open": "pr-open",
      "finished": "finished",
      "initializing": "initializing",
      "idle": "idle",
    }),
  },
  example: ({ state }) => <StateBadge state={state} />,
});
```

- [ ] **Step 6:** Run typecheck.

- [ ] **Step 7:** Commit:

```bash
git add packages/dashboard/src/components/StateBadge.figma.tsx
git commit -m "feat(dashboard): Code Connect mapping for StateBadge (CREW-119)"
```

### Task A.6: Build Crew DS AgentRow component

**Files:**
- Create: `packages/dashboard/src/components/AgentRow.figma.tsx`

The densest composite. Variants align with CVA in code.

- [ ] **Step 1:** Read `packages/dashboard/src/components/AgentRow.tsx`. Capture the CVA variant config + child structure (StateBadge instance + ticket key + title + meta + action buttons).

- [ ] **Step 2:** Reference: agent rows in `Agents List (/)` frame. Take screenshot.

- [ ] **Step 3:** Build AgentRow as a Component Set. Variant axes likely include:
  - `state` (mirrors StateBadge — affects row left-border color too)
  - `hasAction` (boolean — shows action button or not)

Compose: StateBadge instance + text fields (ticket key in Fira Code, title in Hanken Grotesk) + optional Button instance (shadcn's `<Button variant="ghost" size="sm">`).

```js
// Sample shape — adapt to actual variant structure
const variants = [];
for (const state of states) {
  for (const hasAction of [true, false]) {
    const c = figma.createComponent();
    c.name = `state=${state}, hasAction=${hasAction}`;
    // Build row composition: StateBadge instance, text, optional Button
    variants.push(c);
  }
}
const set = figma.combineAsVariants(variants, page);
set.name = "AgentRow";
return { createdNodeIds: [set.id] };
```

- [ ] **Step 4:** Verify with `get_screenshot`. If the variant matrix is too wide (7 states × 2 hasAction = 14), prune to representative variants only (e.g. just 3 states × 2 hasAction = 6) — designer can fill in others later if needed.

- [ ] **Step 5:** Author `AgentRow.figma.tsx`. Map the variant props.

- [ ] **Step 6:** Run typecheck.

- [ ] **Step 7:** Commit:

```bash
git add packages/dashboard/src/components/AgentRow.figma.tsx
git commit -m "feat(dashboard): Code Connect mapping for AgentRow (CREW-119)"
```

### Task A.7: Build Crew DS ProjectSection component

**Files:**
- Create: `packages/dashboard/src/components/ProjectSection.figma.tsx`

- [ ] **Step 1:** Read `packages/dashboard/src/components/ProjectSection.tsx`.

- [ ] **Step 2:** Reference: project sections (per-project grouping headers) in the agents list. Take screenshot.

- [ ] **Step 3:** Build ProjectSection in Crew DS — a header row (project name + meta) + slot for child AgentRow instances. Likely a single component (no variants), or with `expanded` boolean if collapsibility is in scope.

- [ ] **Step 4:** Verify with `get_screenshot`.

- [ ] **Step 5:** Author `ProjectSection.figma.tsx`.

- [ ] **Step 6:** Run typecheck.

- [ ] **Step 7:** Commit:

```bash
git add packages/dashboard/src/components/ProjectSection.figma.tsx
git commit -m "feat(dashboard): Code Connect mapping for ProjectSection (CREW-119)"
```

### Task A.8: Build Crew DS AgentsList component

**Files:**
- Create: `packages/dashboard/src/components/AgentsList.figma.tsx`

- [ ] **Step 1:** Read `packages/dashboard/src/components/AgentsList.tsx`. This is the route-level container.

- [ ] **Step 2:** Reference: full Agents List page layout.

- [ ] **Step 3:** Build AgentsList in Crew DS. Should compose ProjectSection instances + (optional) empty state. Single variant likely sufficient.

- [ ] **Step 4:** Verify with `get_screenshot`.

- [ ] **Step 5:** Author `AgentsList.figma.tsx`.

- [ ] **Step 6:** Run typecheck.

- [ ] **Step 7:** Commit:

```bash
git add packages/dashboard/src/components/AgentsList.figma.tsx
git commit -m "feat(dashboard): Code Connect mapping for AgentsList (CREW-119)"
```

### Task A.9: Add state-color CSS variables to dashboard `@theme`

**Files:**
- Modify: `packages/dashboard/src/index.css`

The `--color-state-*` variables already exist in `@theme` from CREW-122 (preserved during the migration). Verify they're current, and add `--color-state-foreground` if the design needs a contrasting text color.

- [ ] **Step 1:** Read the current `@theme` block:

```bash
grep -B1 -A20 '@theme' packages/dashboard/src/index.css
```

- [ ] **Step 2:** Confirm all 7 `--color-state-*` entries match the values in the spec:

```css
--color-state-initializing: oklch(0.7 0.16 250);
--color-state-running: oklch(0.78 0.005 260);
--color-state-idle: oklch(0.65 0.01 260);
--color-state-waiting: oklch(0.82 0.16 90);
--color-state-pr-open: oklch(0.72 0.16 295);
--color-state-error: oklch(0.7 0.16 25);
--color-state-finished: oklch(0.72 0.096 150);
```

If any are missing or differ, add/correct.

- [ ] **Step 3:** Run typecheck + tests:

```bash
npm run -w crew-dashboard typecheck
npm run -w crew-dashboard test:run
```

Expected: PASS.

- [ ] **Step 4:** If anything changed, commit:

```bash
git add packages/dashboard/src/index.css
git commit -m "chore(dashboard): align state-color tokens to spec (CREW-119)"
```

If unchanged, no commit needed.

### Task A.10: Refactor `AgentRow.tsx` to use shadcn Button

**Files:**
- Modify: `packages/dashboard/src/components/AgentRow.tsx`

- [ ] **Step 1:** Read `AgentRow.tsx`. Identify the inline `<button>` usage (likely the row's action button — "Provide input", "Resume", "View PR", "Finish", etc.).

- [ ] **Step 2:** Run existing AgentRow tests to baseline:

```bash
npm run -w crew-dashboard test:run -- AgentRow
```

Expected: PASS (current state is the baseline).

- [ ] **Step 3:** Replace inline `<button className="...">` with `<Button variant="ghost" size="sm">` (or appropriate variant — check the Figma reference). Import:

```tsx
import { Button } from "@/components/ui/button";
```

If multiple buttons exist (e.g. "Resume" and "View PR" side by side), each becomes its own `<Button>`.

- [ ] **Step 4:** Run typecheck:

```bash
npm run -w crew-dashboard typecheck
```

Expected: PASS.

- [ ] **Step 5:** Run AgentRow tests again:

```bash
npm run -w crew-dashboard test:run -- AgentRow
```

Expected: PASS. If a snapshot test exists and it changed, update the snapshot only after visually confirming the rendered HTML is correct (Button adds wrapper spans + classes).

- [ ] **Step 6:** Run dev server, visually verify the AgentRow buttons still look + behave correctly:

```bash
npm run -w crew-dashboard dev
```

Visit `http://localhost:5173`, find an agent row with action buttons, click — should work.

- [ ] **Step 7:** Commit:

```bash
git add packages/dashboard/src/components/AgentRow.tsx
git commit -m "refactor(dashboard): AgentRow uses shadcn Button primitive (CREW-119)"
```

### Task A.11: Refactor `StateBadge.tsx` to use state-color tokens

**Files:**
- Modify: `packages/dashboard/src/components/StateBadge.tsx`

- [ ] **Step 1:** Read current `StateBadge.tsx`. It probably already uses `bg-state-running` etc. classes (since CREW-122 preserved the tokens). Confirm.

- [ ] **Step 2:** Verify the CVA shape uses semantic intent (variant per state) rather than raw color values. If it currently hardcodes hex colors, refactor to use the `state-*` Tailwind classes via CVA:

```tsx
import { cva } from "class-variance-authority";

const stateBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      state: {
        running: "bg-state-running text-state-running-foreground",
        error: "bg-state-error text-state-error-foreground",
        waiting: "bg-state-waiting text-state-waiting-foreground",
        "pr-open": "bg-state-pr-open text-state-pr-open-foreground",
        finished: "bg-state-finished text-state-finished-foreground",
        initializing: "bg-state-initializing text-state-initializing-foreground",
        idle: "bg-state-idle text-state-idle-foreground",
      },
    },
  }
);
```

(If `text-state-X-foreground` tokens don't exist, use `text-foreground` or skip the foreground class — Task A.9 step covers any needed additions.)

- [ ] **Step 3:** Run typecheck:

```bash
npm run -w crew-dashboard typecheck
```

Expected: PASS.

- [ ] **Step 4:** Run StateBadge tests:

```bash
npm run -w crew-dashboard test:run -- StateBadge
```

Expected: PASS.

- [ ] **Step 5:** Verify visually in dev — every agent state should render with its color.

- [ ] **Step 6:** Commit:

```bash
git add packages/dashboard/src/components/StateBadge.tsx
git commit -m "refactor(dashboard): StateBadge variants via CVA + state-* tokens (CREW-119)"
```

### Task A.12: Run dashboard full validation

**Files:** None (validation only).

- [ ] **Step 1:** Typecheck:

```bash
npm run -w crew-dashboard typecheck
```

- [ ] **Step 2:** Tests:

```bash
npm run -w crew-dashboard test:run
```

- [ ] **Step 3:** Build:

```bash
npm run -w crew-dashboard build
```

- [ ] **Step 4:** Dev render check:

```bash
npm run -w crew-dashboard dev
```

Visit `http://localhost:5173` — the agents list should render correctly. No FOUC, no missing colors, no broken interaction.

All four expected: PASS / no visual regressions.

### Task A.13: Migrate `Agents List (/)` Figma frame — color binding

**Files:** None (Figma-only). Screens file: `9FeJPriqdsdA4n9R5Xsrr8`, frame: `1:2`.

- [ ] **Step 1:** Get current state via `get_screenshot` of the Agents List frame for diff comparison.

- [ ] **Step 2:** Walk the frame via `use_figma` to enumerate fill-bearing nodes + their hardcoded colors:

```js
const frame = await figma.getNodeByIdAsync("1:2");
const nodes = frame.findAll(n =>
  ("fills" in n) && Array.isArray(n.fills) && n.fills.some(f => f.type === "SOLID" && !f.boundVariables)
);
return nodes.map(n => ({
  id: n.id,
  name: n.name,
  fillColors: n.fills.filter(f => f.type === "SOLID").map(f => f.color),
}));
```

- [ ] **Step 3:** Group nodes by intended semantic role (designer judgment per element). Common patterns:
  - Page background → `background`
  - Container backgrounds → `card`
  - Borders / dividers → `border`
  - Dim text → `muted-foreground`
  - Body text → `foreground`
  - State pill backgrounds → `state/<state>` per agent state

- [ ] **Step 4:** Apply bindings via a `use_figma` script — `setBoundVariableForPaint` per node, importing each Crew semantic token by key (use the keys captured from `Crew / Semantic Colors` collection):

```js
// Pattern
const crewBg = await figma.variables.importVariableByKeyAsync("<key>");
node.fills = node.fills.map(f => f.type === "SOLID"
  ? figma.variables.setBoundVariableForPaint(f, "color", crewBg)
  : f
);
```

- [ ] **Step 5:** Verify with `get_screenshot` — should look identical (or improved) vs the original.

- [ ] **Step 6:** No code commit (Figma-only).

### Task A.14: Migrate `Agents List (/)` Figma frame — composite swap

**Files:** None (Figma-only).

- [ ] **Step 1:** Identify detached primitive structures in the Agents List frame:
  - Frames named `Background+Border+Shadow` or `Container+Border` acting as buttons → swap to `Button` instances (from Core's shadcn kit)
  - Inline state-pill structures → swap to `StateBadge` instances (from Crew DS, Task A.5)
  - Per-agent rows → swap to `AgentRow` instances (Task A.6)
  - Project-grouping headers → swap to `ProjectSection` instances (Task A.7)
  - The full list container → optionally swap to `AgentsList` (Task A.8) — judgment call, may be too coarse-grained

- [ ] **Step 2:** For each, write a `use_figma` script using `node.swapComponent(target)` to replace the detached structure with the proper Crew DS component instance.

- [ ] **Step 3:** Apply variant properties on each new instance to match the original's intent (e.g. each AgentRow instance's `state` variant matches the original row's state).

- [ ] **Step 4:** Verify with `get_screenshot` — confirm the visual is preserved or improved.

- [ ] **Step 5:** No code commit.

### Task A.15: Visual fidelity sweep

**Files:** None primarily (any dashboard fixes go in their components).

The original CREW-119 ticket goal — close gaps between dashboard rendered output and the Figma frame.

- [ ] **Step 1:** Take a high-resolution screenshot of the Crew Dashboard Screens `Agents List (/)` frame (now migrated; Tasks A.13 + A.14):

```js
// via get_screenshot MCP, large maxDimension
```

- [ ] **Step 2:** Run dev server, visit `http://localhost:5173`, take a browser screenshot of the same view.

- [ ] **Step 3:** Compare side by side. Walk top-to-bottom — header, project sections, agent rows, action buttons. List discrepancies (spacing, color, font weight, alignment, missing affordances).

- [ ] **Step 4:** For each discrepancy, decide source-of-truth:
  - **Code is right, Figma needs fix:** update the Figma frame.
  - **Figma is right, code needs fix:** update the dashboard component.
  - **Neither captures the actual intent:** raise inline with the user; resolve before continuing.

- [ ] **Step 5:** Apply fixes. Each fix is its own commit (component fix → `refactor(dashboard): ...`; Figma fix → no commit).

- [ ] **Step 6:** Re-screenshot both sides after fixes; confirm convergence.

- [ ] **Step 7:** If fidelity sweep grows beyond 1 day, scope-reduce per spec: defer remaining gaps to a fast-follow ticket.

### Task A.16: Update `docs/plans/design-system.md` inventory

**Files:**
- Modify: `docs/plans/design-system.md`

- [ ] **Step 1:** Add or extend a `## Component inventory` section. Each entry:

```markdown
- **TopNav** — Crew DS node `<id>`; dashboard `packages/dashboard/src/components/TopNav.tsx`; Code Connect `packages/dashboard/src/components/TopNav.figma.tsx`
- **BrandMark** — Crew DS node `<id>`; dashboard `packages/dashboard/src/components/BrandMark.tsx`; Code Connect `packages/dashboard/src/components/BrandMark.figma.tsx`
- ... (one per Phase A composite)
```

- [ ] **Step 2:** Update the Status table row for "Phase 4 — Full Crew DS coverage" to reflect partial completion (CREW-119 done, 6 of 11 composites built).

- [ ] **Step 3:** Add a section noting state-color semantic tokens were added to `Crew / Semantic Colors`:

```markdown
### State-color semantic tokens (added in CREW-119)

`Crew / Semantic Colors` now includes 7 state tokens (`state/initializing`, `state/running`, `state/idle`, `state/waiting`, `state/pr-open`, `state/error`, `state/finished`) — each a single-value alias to a Tailwind primitive in Core (no light/dark variants). Used by `StateBadge` + the row-state styling on `AgentRow`. Mirrors the `--color-state-*` tokens in `packages/dashboard/src/index.css`.
```

- [ ] **Step 4:** Commit:

```bash
git add docs/plans/design-system.md
git commit -m "docs(design-system): inventory + state tokens (CREW-119)"
```

### Task A.17: Phase A acceptance verification

**Files:** None.

- [ ] **Step 1:** Verify all 6 Crew DS composites exist on the Composites page in Crew DS file via `get_metadata`.

- [ ] **Step 2:** Verify `Crew / Semantic Colors` has 55 variables (48 + 7 state tokens) via `use_figma`.

- [ ] **Step 3:** Verify all 6 `.figma.tsx` files exist in `packages/dashboard/src/components/`:

```bash
ls packages/dashboard/src/components/*.figma.tsx
```

Expected: BrandMark, TopNav, StateBadge, AgentRow, ProjectSection, AgentsList (plus the 7 shadcn primitive ones from CREW-125).

- [ ] **Step 4:** Verify Agents List frame is migrated — no remaining hardcoded fills (script):

```js
const frame = await figma.getNodeByIdAsync("1:2");
const unbound = frame.findAll(n =>
  ("fills" in n) && Array.isArray(n.fills) && n.fills.some(f =>
    f.type === "SOLID" && (!f.boundVariables || !Object.keys(f.boundVariables).length)
  )
);
return { unboundCount: unbound.length, samples: unbound.slice(0, 10).map(n => n.name) };
```

Expected: `unboundCount: 0` (or close — some text fills may stay raw if intentional).

- [ ] **Step 5:** Run final dashboard validation:

```bash
npm run -w crew-dashboard typecheck && npm run -w crew-dashboard test:run && npm run -w crew-dashboard build
```

All PASS.

- [ ] **Step 6:** Surface to user: "Crew DS publish required (Plugin API can't do it). Open Crew DS in Figma desktop → Assets → Publish library." (User-only step, same pattern as CREW-124.)

**Phase A acceptance:** All 6 Crew DS composites built + Code Connected. State-color tokens added. Agents List frame migrated. Dashboard refactored + validated. design-system.md inventory updated. Ready to mark CREW-119 Done.

---

## Phase B — CREW-117 — Agent drawer vertical slice

> **Prerequisite:** Phase A merged. `StateBadge` already exists in Crew DS — Phase B reuses, doesn't rebuild.

### Task B.1: Read context

**Files:** None.

- [ ] **Step 1:** Read the spec: `docs/superpowers/specs/2026-05-10-fidelity-vertical-slices-design.md`.
- [ ] **Step 2:** Read `docs/plans/design-system.md` (now updated with Phase A inventory).
- [ ] **Step 3:** Read the dashboard components for this slice:
  - `packages/dashboard/src/components/AgentBody.tsx`
  - `packages/dashboard/src/components/StateHistoryBar.tsx`
  - `packages/dashboard/src/components/TokenTable.tsx`
  - `packages/dashboard/src/components/ViewportFrame.tsx`
- [ ] **Step 4:** Read the agent drawer hand-off documentation in `docs/designs/design_handoff_crew_dashboard_v2/README.md`.

### Task B.2: Verify StateBadge exists in Crew DS (no rebuild)

**Files:** None (verification).

- [ ] **Step 1:** Verify StateBadge exists in Crew DS Composites page via `get_metadata`:

```js
const page = figma.root.children.find(p => p.name === "Composites");
await figma.setCurrentPageAsync(page);
const sb = page.findAll(n => (n.type === "COMPONENT_SET" || n.type === "COMPONENT") && n.name === "StateBadge");
return { exists: sb.length > 0, ids: sb.map(c => c.id) };
```

Expected: `exists: true`. If false, Phase A wasn't merged — STOP and surface to user.

### Task B.3: Build Crew DS AgentBody component

**Files:**
- Create: `packages/dashboard/src/components/AgentBody.figma.tsx`

The drawer's main container — headers, body content, action bar.

- [ ] **Step 1:** Read `packages/dashboard/src/components/AgentBody.tsx`.

- [ ] **Step 2:** Reference: `Agents List (/) - Agent Drawer Open` frame in Crew Dashboard Screens. Take screenshot of the drawer chrome.

- [ ] **Step 3:** Build AgentBody as a Crew DS component on the Composites page. Compose: header (title + close), body slot, action bar slot.

- [ ] **Step 4:** Verify with `get_screenshot`.

- [ ] **Step 5:** Author `AgentBody.figma.tsx`.

- [ ] **Step 6:** Run typecheck.

- [ ] **Step 7:** Commit:

```bash
git add packages/dashboard/src/components/AgentBody.figma.tsx
git commit -m "feat(dashboard): Code Connect mapping for AgentBody (CREW-117)"
```

### Task B.4: Build Crew DS StateHistoryBar component

**Files:**
- Create: `packages/dashboard/src/components/StateHistoryBar.figma.tsx`

A horizontal timeline of agent state transitions, color-coded.

- [ ] **Step 1:** Read `packages/dashboard/src/components/StateHistoryBar.tsx`. Capture the data model (state segments + duration).

- [ ] **Step 2:** Reference: state history bars in the agent drawer hand-off.

- [ ] **Step 3:** Build StateHistoryBar in Crew DS — likely a Frame with horizontal segments, each segment's fill bound to a `state/*` Crew DS token. Component might have variants for different state-history shapes; default to a representative single configuration.

- [ ] **Step 4:** Verify with `get_screenshot`.

- [ ] **Step 5:** Author `StateHistoryBar.figma.tsx`.

- [ ] **Step 6:** Run typecheck.

- [ ] **Step 7:** Commit:

```bash
git add packages/dashboard/src/components/StateHistoryBar.figma.tsx
git commit -m "feat(dashboard): Code Connect mapping for StateHistoryBar (CREW-117)"
```

### Task B.5: Build Crew DS TokenTable component

**Files:**
- Create: `packages/dashboard/src/components/TokenTable.figma.tsx`

Tabular display of token usage per turn / per tool.

- [ ] **Step 1:** Read `packages/dashboard/src/components/TokenTable.tsx`. Capture columns + row structure.

- [ ] **Step 2:** Reference: token table in the agent drawer hand-off.

- [ ] **Step 3:** Build TokenTable in Crew DS — header row + body rows. Bind borders to `border` semantic token; cells to `card`/`background`. Numbers use Fira Code (`mono`).

- [ ] **Step 4:** Verify with `get_screenshot`.

- [ ] **Step 5:** Author `TokenTable.figma.tsx`.

- [ ] **Step 6:** Run typecheck.

- [ ] **Step 7:** Commit:

```bash
git add packages/dashboard/src/components/TokenTable.figma.tsx
git commit -m "feat(dashboard): Code Connect mapping for TokenTable (CREW-117)"
```

### Task B.6: Build Crew DS ViewportFrame component

**Files:**
- Create: `packages/dashboard/src/components/ViewportFrame.figma.tsx`

Device-frame wrapper for the embedded preview iframe.

- [ ] **Step 1:** Read `packages/dashboard/src/components/ViewportFrame.tsx`.

- [ ] **Step 2:** Reference: viewport frame in the agent drawer (typically a chrome-bordered placeholder for the live preview).

- [ ] **Step 3:** Build ViewportFrame in Crew DS — a frame with title bar (URL chip) + content area.

- [ ] **Step 4:** Verify with `get_screenshot`.

- [ ] **Step 5:** Author `ViewportFrame.figma.tsx`.

- [ ] **Step 6:** Run typecheck.

- [ ] **Step 7:** Commit:

```bash
git add packages/dashboard/src/components/ViewportFrame.figma.tsx
git commit -m "feat(dashboard): Code Connect mapping for ViewportFrame (CREW-117)"
```

### Task B.7: Refactor dashboard composites for shadcn primitive consumption

**Files:**
- Modify: `packages/dashboard/src/components/AgentBody.tsx`
- Modify: any of `StateHistoryBar.tsx`, `TokenTable.tsx`, `ViewportFrame.tsx` if they have inline shadcn-replaceable patterns

Spot-fix opportunities discovered during the build.

- [ ] **Step 1:** For each component touched in Tasks B.3-B.6, scan for inline `<button>` patterns or shadcn-replaceable structures (e.g. AgentBody's drawer Close button → shadcn `<Button variant="ghost" size="icon">`).

- [ ] **Step 2:** Refactor in place. Each refactor: import from `@/components/ui/`, replace markup, run typecheck.

- [ ] **Step 3:** Run full validation:

```bash
npm run -w crew-dashboard typecheck && npm run -w crew-dashboard test:run
```

Expected: PASS.

- [ ] **Step 4:** Commit per refactored file (or one combined if small):

```bash
git add packages/dashboard/src/components/AgentBody.tsx
git commit -m "refactor(dashboard): AgentBody close button uses shadcn (CREW-117)"
```

### Task B.8: Migrate `Agents List (/) - Agent Drawer Open` Figma frame

**Files:** None (Figma-only). Screens file: `9FeJPriqdsdA4n9R5Xsrr8`, frame: `1:378`.

- [ ] **Step 1:** Get baseline screenshot.

- [ ] **Step 2:** Walk fill-bearing nodes + group by semantic role (same pattern as Task A.13).

- [ ] **Step 3:** Apply Crew semantic token bindings via `use_figma`.

- [ ] **Step 4:** Swap detached primitive structures for Crew DS instances:
  - Drawer chrome → AgentBody instance
  - State history visual → StateHistoryBar instance
  - Token table → TokenTable instance
  - Viewport preview → ViewportFrame instance
  - Any state pills → StateBadge instances (from Phase A)

- [ ] **Step 5:** Verify with `get_screenshot`.

- [ ] **Step 6:** No code commit.

### Task B.9: Migrate `Agent Page (/agent/XXX-123/full)` Figma frame

**Files:** None (Figma-only). Frame: `1:1900`.

The full-page agent view (drawer expanded to full viewport).

- [ ] **Step 1:** Get baseline screenshot.

- [ ] **Step 2:** Walk + bind colors (same pattern as Task A.13).

- [ ] **Step 3:** Swap detached primitives — same component set as Task B.8 since the layout is the drawer expanded.

- [ ] **Step 4:** Verify with `get_screenshot`.

- [ ] **Step 5:** No code commit.

### Task B.10: Visual fidelity sweep

**Files:** None primarily (component fixes go in their files).

- [ ] **Step 1:** Screenshot the migrated `Agents List (/) - Agent Drawer Open` Figma frame.

- [ ] **Step 2:** Run dev server, open the agent drawer in the dashboard, take browser screenshot.

- [ ] **Step 3:** Compare top-to-bottom — drawer header, state history bar, token table, viewport, action bar. List discrepancies.

- [ ] **Step 4:** Apply fixes per the source-of-truth decision rule (Task A.15 Step 4). Repeat for the full-page Agent Page if it differs from the drawer.

- [ ] **Step 5:** Re-screenshot; confirm convergence.

- [ ] **Step 6:** Same scope-reduce rule as Phase A: if the sweep grows past ~1 day, defer remaining gaps to a fast-follow ticket.

### Task B.11: Update `docs/plans/design-system.md` inventory

**Files:**
- Modify: `docs/plans/design-system.md`

- [ ] **Step 1:** Append Phase B composites to the Component inventory section (AgentBody, StateHistoryBar, TokenTable, ViewportFrame) with their Figma node IDs.

- [ ] **Step 2:** Update the Status table row for Phase 4 — now 10 of 11 composites built (only ErrorFallback remains).

- [ ] **Step 3:** Commit:

```bash
git add docs/plans/design-system.md
git commit -m "docs(design-system): inventory updates for CREW-117"
```

### Task B.12: Phase B acceptance verification

**Files:** None.

- [ ] **Step 1:** Verify all 4 new Crew DS composites (AgentBody, StateHistoryBar, TokenTable, ViewportFrame) exist on the Composites page via `get_metadata`.

- [ ] **Step 2:** Verify all 4 new `.figma.tsx` files exist:

```bash
ls packages/dashboard/src/components/{AgentBody,StateHistoryBar,TokenTable,ViewportFrame}.figma.tsx
```

- [ ] **Step 3:** Verify both Figma frames are migrated — no remaining hardcoded fills (same script pattern as Task A.17 Step 4).

- [ ] **Step 4:** Run final dashboard validation:

```bash
npm run -w crew-dashboard typecheck && npm run -w crew-dashboard test:run && npm run -w crew-dashboard build
```

All PASS.

- [ ] **Step 5:** Surface to user: "Crew DS publish required to capture Phase B additions. Open Crew DS in Figma desktop → Assets → Publish library."

**Phase B acceptance:** All 4 new Crew DS composites built + Code Connected. Both drawer-related frames migrated. Dashboard validated. design-system.md updated. Ready to mark CREW-117 Done.

---

## Self-review checklist (post-write)

- [ ] **Spec coverage:** Every Phase 4 deliverable + the 5-step bundle from the spec is represented as a task.
- [ ] **Placeholder scan:** `<id>` placeholders in `.figma.tsx` examples are intentional — they're filled with real Figma node IDs at execution time. `<key>` for variable imports same. The `(adjust based on Step 1's actual primitives)` notes are real-time judgment calls, not vague TODOs. No "implement later" or "add error handling" loose ends.
- [ ] **Type consistency:** Variant property names align across Figma component builds (Tasks A.5, A.6, B.x) and Code Connect mappings.
- [ ] **Commit messages reference ticket keys** as `CREW-119` and `CREW-117`.

---

## Notes for the ticketing pass

Both tickets already exist (CREW-117, CREW-119). They predate the design system bootstrap — original scope was code-only fidelity sweep. Per the spec, no new Epic; refresh existing tickets.

**Ticket update plan:**

- **CREW-119:** Update description to reflect bundled vertical-slice scope. Reference this plan's Phase A. Definition of done becomes the Phase A acceptance criteria.
- **CREW-117:** Same — reference Phase B. Note dependency on CREW-119 (StateBadge prerequisite).

**Dependency edge:** Add a Jira "is blocked by" link from CREW-117 to CREW-119 so the parallelism story is unambiguous.

**Recommended sequence:** `crew run CREW-119` → wait for merge → `crew run CREW-117`. Could be partially parallel if CREW-117 is dispatched ~10 minutes after CREW-119 starts (so StateBadge lands first), but cleaner to serialize.
