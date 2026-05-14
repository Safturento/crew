# Crew DS Palette Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED COMPANION SKILLS:**
>
> - `figma-use` (the official Figma plugin's MCP skill) — every `use_figma` call MUST invoke this skill first
> - `figma-design-system-propagation` — for the publish lifecycle, verification, override stickiness, and mode-chain trap addenda baked into Phase C/D
> - `figma-screen-migration` — for context on how the existing 3 migrated frames were built (re-verification in Phase C reads against this skill's mental model)

**Goal:** Re-align Crew DS color tokens to the dashboard's actual blue-tinted slate palette by re-aliasing 27 variables in `Crew / Semantic Colors` directly to Core's `tw/colors/slate` (skipping Core's `mode` collection), update `packages/dashboard/src/index.css` to reference the same stock Tailwind slate utilities, then re-verify migrated frames + close two known visual defects.

**Architecture:** Crew DS becomes the single source of mode resolution by aliasing directly to mode-invariant primitives (`tw/colors/slate-XXX`, `tw/colors/red-400`, `tw/colors/white`) instead of through Core's two-mode `mode` collection. Both code (CSS) and design (Figma) reference identical Tailwind shade names — implementation matches design 1:1 by construction. Side-effect: the two-collection mode-chain trap (documented in `figma-design-system-propagation` Trap 2) stops applying to Crew consumers.

**Tech Stack:** Figma Plugin API via MCP `use_figma` (re-aliasing scripts), Figma desktop UI (manual library publish — Plugin API has no equivalent), Tailwind v4 CSS-first config in `packages/dashboard/src/index.css`, MCP `get_screenshot` for live API verification, `npm run lint` / `format` / `typecheck` for code-side validation.

**Reference spec:** `docs/superpowers/specs/2026-05-10-crew-ds-palette-correction-design.md`

---

## File structure

| File                                                                                              | Responsibility                                                                                                                                                                                                                    | Phase |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Crew DS Figma file (`DsA7QuEa2WthDATkksd1Bq`)                                                     | Re-alias 27 variables in `Crew / Semantic Colors` to `tw/colors` directly. Fix AgentBody composite (node `24:2`) to embed a real `StateBadge` instance instead of a hand-rolled pill.                                             | A, C  |
| `packages/dashboard/src/index.css`                                                                | Dashboard color tokens. Replace custom hex / OKLCH values in `.dark`, `:root`, and `@theme` blocks with `var(--color-*)` references to stock Tailwind slate / red / amber / blue / violet / emerald shades.                       | B     |
| Crew Dashboard Screens Figma file (`9FeJPriqdsdA4n9R5Xsrr8`)                                      | Re-screenshot migrated frames (`1:2`, `1:378`, `1:1900`) for visual verification. Fix Inspect button styling on frame `1:2` per the canonical tinted-pill pattern.                                                                | C     |
| `docs/plans/design-system.md`                                                                     | Replace "v1 overrides — None" claim with the new direct-alias strategy. Document slate mapping table, deferred groups (chart/sidebar/kit-extras), and the three future-extensibility patterns. Update Mode resolution subsection. | D     |
| `~/.claude/skills/figma-design-system-propagation/SKILL.md`                                       | Add "exception when override aliases to mode-invariant primitives" note to Trap 2.                                                                                                                                                | D     |
| `~/.claude/skills/figma-screen-migration/SKILL.md`                                                | Add corresponding exception note to Phase 2 (set modes).                                                                                                                                                                          | D     |
| `~/.claude/projects/-home-safturento-Repos-crew/memory/project_crew_ds_palette_strategy.md` (NEW) | Project memory entry capturing the direct-alias strategy + when each future-extension pattern applies.                                                                                                                            | D     |
| `~/.claude/projects/-home-safturento-Repos-crew/memory/MEMORY.md`                                 | Add line to index pointing at the new memory file.                                                                                                                                                                                | D     |

---

## Phase A — Crew DS Figma re-aliasing

Mutates the Crew DS Figma file (`DsA7QuEa2WthDATkksd1Bq`). All steps run via `use_figma` against that fileKey. Read the `figma-use` skill before any `use_figma` call.

### Task A1: Capture baseline of Crew Semantic Colors

**Files:**

- Modify: Crew DS Figma file (`DsA7QuEa2WthDATkksd1Bq`) — pure read, no mutations

- [ ] **Step 1: Read all 44 color variables + their current alias targets in both modes**

```js
// use_figma against DsA7QuEa2WthDATkksd1Bq, skillNames: "figma-use"
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const semantic = cols.find((c) => c.name === 'Crew / Semantic Colors');
const allVars = await Promise.all(
  semantic.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)),
);
const colorVars = allVars.filter((v) => v.resolvedType === 'COLOR');

const lightModeId = semantic.modes.find((m) => /light/i.test(m.name)).modeId;
const darkModeId = semantic.modes.find((m) => /dark/i.test(m.name)).modeId;

const baseline = [];
for (const v of colorVars) {
  const light = v.valuesByMode[lightModeId];
  const dark = v.valuesByMode[darkModeId];
  let lightTarget = '(direct)',
    darkTarget = '(direct)';
  if (light?.type === 'VARIABLE_ALIAS') {
    const t = await figma.variables.getVariableByIdAsync(light.id);
    if (t) {
      const tc = await figma.variables.getVariableCollectionByIdAsync(t.variableCollectionId);
      lightTarget = `${tc?.name}/${t.name}`;
    }
  }
  if (dark?.type === 'VARIABLE_ALIAS') {
    const t = await figma.variables.getVariableByIdAsync(dark.id);
    if (t) {
      const tc = await figma.variables.getVariableCollectionByIdAsync(t.variableCollectionId);
      darkTarget = `${tc?.name}/${t.name}`;
    }
  }
  baseline.push({ id: v.id, name: v.name, light: lightTarget, dark: darkTarget });
}

return { totalColorVars: colorVars.length, baseline };
```

Expected: `{ totalColorVars: 44, baseline: [...] }`. Confirms the 19 + 8 + 5 + 8 + 4 split. Save the output as a comment in the next task's script for "before/after" auditing.

- [ ] **Step 2: Verify the 5 groups are present**

Visually scan the baseline output for:

- 19 standard shadcn semantics (background, foreground, card, …, ring, destructive, destructive-foreground)
- 8 state/\* tokens (state/initializing through state/foreground)
- 5 chart-\* tokens
- 8 sidebar-\* tokens
- 4 kit-extras (background-color, semantic-background, semantic-border, semantic-foreground)

If any are missing or named differently, STOP and confirm with the user before proceeding — the spec's mapping tables assume these exact names.

### Task A2: Re-alias the 19 standard shadcn semantics (group 1a)

**Files:**

- Modify: Crew DS Figma file (`DsA7QuEa2WthDATkksd1Bq`) — Crew Semantic Colors group 1a

- [ ] **Step 1: Import the 8 needed `tw/colors` library variables**

```js
// use_figma against DsA7QuEa2WthDATkksd1Bq, skillNames: "figma-use"
const libCols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
const twColors = libCols.find(
  (c) => c.libraryName === 'Core Design System' && c.name === 'tw/colors',
);
if (!twColors)
  return {
    error: 'no tw/colors in linked libs',
    libs: libCols.map((c) => `${c.libraryName}::${c.name}`),
  };

const refs = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(twColors.key);

// Names needed for group 1a
const NEEDED = [
  'slate/50',
  'slate/200',
  'slate/400',
  'slate/500',
  'slate/800',
  'slate/900',
  'slate/950',
  'red/400',
  'white',
];
const imported = {};
const missing = [];
for (const name of NEEDED) {
  const ref = refs.find((r) => r.name === name);
  if (!ref) {
    missing.push(name);
    continue;
  }
  imported[name] = await figma.variables.importVariableByKeyAsync(ref.key);
}

return {
  importedCount: Object.keys(imported).length,
  importedIds: Object.fromEntries(Object.entries(imported).map(([n, v]) => [n, v.id])),
  missing,
};
```

Expected: `{ importedCount: 9, missing: [] }`. If `missing` is non-empty, the variable name in Core differs — STOP and inspect Core's `tw/colors` for the actual naming.

- [ ] **Step 2: Re-alias all 19 group-1a variables**

```js
// use_figma against DsA7QuEa2WthDATkksd1Bq, skillNames: "figma-use"
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const semantic = cols.find((c) => c.name === 'Crew / Semantic Colors');
const allVars = await Promise.all(
  semantic.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)),
);
const byName = new Map(allVars.map((v) => [v.name, v]));

const lightModeId = semantic.modes.find((m) => /light/i.test(m.name)).modeId;
const darkModeId = semantic.modes.find((m) => /dark/i.test(m.name)).modeId;

// Re-import the tw/colors variables (cheap — just retrieves from cache)
const libCols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
const twColors = libCols.find(
  (c) => c.libraryName === 'Core Design System' && c.name === 'tw/colors',
);
const refs = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(twColors.key);
const tw = {};
for (const name of [
  'slate/50',
  'slate/200',
  'slate/400',
  'slate/500',
  'slate/800',
  'slate/900',
  'slate/950',
  'red/400',
  'white',
]) {
  tw[name] = await figma.variables.importVariableByKeyAsync(refs.find((r) => r.name === name).key);
}

// Group 1a mapping (semantic → tw/colors target). Both modes alias to the SAME tw/colors variable
// (slate is mode-invariant in tw/colors — single-mode collection).
const MAP_1A = {
  background: 'slate/950',
  foreground: 'slate/200',
  card: 'slate/900',
  'card-foreground': 'slate/200',
  popover: 'slate/900',
  'popover-foreground': 'slate/200',
  primary: 'slate/200',
  'primary-foreground': 'slate/900',
  secondary: 'slate/800',
  'secondary-foreground': 'slate/200',
  muted: 'slate/800',
  'muted-foreground': 'slate/400',
  accent: 'slate/800',
  'accent-foreground': 'slate/200',
  destructive: 'red/400',
  'destructive-foreground': 'slate/50',
  border: 'white',
  input: 'white',
  ring: 'slate/500',
};

const updates = [];
const skipped = [];
for (const [semanticName, twName] of Object.entries(MAP_1A)) {
  const v = byName.get(semanticName);
  if (!v) {
    skipped.push({ semanticName, reason: 'not found' });
    continue;
  }
  const target = tw[twName];
  if (!target) {
    skipped.push({ semanticName, twName, reason: 'tw target not imported' });
    continue;
  }
  v.setValueForMode(lightModeId, { type: 'VARIABLE_ALIAS', id: target.id });
  v.setValueForMode(darkModeId, { type: 'VARIABLE_ALIAS', id: target.id });
  updates.push({ semanticName, twName });
}

return {
  updatedCount: updates.length,
  updates,
  skipped,
  mutatedNodeIds: updates.map((u) => byName.get(u.semanticName).id),
};
```

Expected: `{ updatedCount: 19, skipped: [] }`. If anything is skipped, STOP and resolve before proceeding.

- [ ] **Step 3: Verify by re-reading + asserting new alias targets**

```js
// use_figma against DsA7QuEa2WthDATkksd1Bq, skillNames: "figma-use"
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const semantic = cols.find((c) => c.name === 'Crew / Semantic Colors');
const allVars = await Promise.all(
  semantic.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)),
);

const EXPECTED = {
  background: 'slate/950',
  foreground: 'slate/200',
  card: 'slate/900',
  'card-foreground': 'slate/200',
  popover: 'slate/900',
  'popover-foreground': 'slate/200',
  primary: 'slate/200',
  'primary-foreground': 'slate/900',
  secondary: 'slate/800',
  'secondary-foreground': 'slate/200',
  muted: 'slate/800',
  'muted-foreground': 'slate/400',
  accent: 'slate/800',
  'accent-foreground': 'slate/200',
  destructive: 'red/400',
  'destructive-foreground': 'slate/50',
  border: 'white',
  input: 'white',
  ring: 'slate/500',
};
const lightModeId = semantic.modes.find((m) => /light/i.test(m.name)).modeId;
const darkModeId = semantic.modes.find((m) => /dark/i.test(m.name)).modeId;

const mismatches = [];
for (const [name, expected] of Object.entries(EXPECTED)) {
  const v = allVars.find((av) => av.name === name);
  if (!v) {
    mismatches.push({ name, reason: 'missing' });
    continue;
  }
  for (const [modeId, modeName] of [
    [lightModeId, 'light'],
    [darkModeId, 'dark'],
  ]) {
    const value = v.valuesByMode[modeId];
    if (value?.type !== 'VARIABLE_ALIAS') {
      mismatches.push({ name, mode: modeName, reason: 'not an alias' });
      continue;
    }
    const target = await figma.variables.getVariableByIdAsync(value.id);
    if (target?.name !== expected) {
      mismatches.push({ name, mode: modeName, expected, actual: target?.name });
    }
  }
}

return { passed: mismatches.length === 0, mismatches };
```

Expected: `{ passed: true, mismatches: [] }`. Each variable in both modes points at the expected `tw/colors` target.

### Task A3: Re-alias the 8 state tokens (group 1b)

**Files:**

- Modify: Crew DS Figma file (`DsA7QuEa2WthDATkksd1Bq`) — Crew Semantic Colors group 1b

- [ ] **Step 1: Re-alias state tokens**

```js
// use_figma against DsA7QuEa2WthDATkksd1Bq, skillNames: "figma-use"
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const semantic = cols.find((c) => c.name === 'Crew / Semantic Colors');
const allVars = await Promise.all(
  semantic.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)),
);
const byName = new Map(allVars.map((v) => [v.name, v]));

const lightModeId = semantic.modes.find((m) => /light/i.test(m.name)).modeId;
const darkModeId = semantic.modes.find((m) => /dark/i.test(m.name)).modeId;

const libCols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
const twColors = libCols.find(
  (c) => c.libraryName === 'Core Design System' && c.name === 'tw/colors',
);
const refs = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(twColors.key);

const NEEDED = [
  'blue/400',
  'slate/400',
  'slate/500',
  'amber/400',
  'violet/400',
  'red/400',
  'emerald/500',
  'slate/950',
];
const tw = {};
for (const name of NEEDED) {
  const r = refs.find((rr) => rr.name === name);
  if (!r) return { error: `tw/colors / ${name} not found` };
  tw[name] = await figma.variables.importVariableByKeyAsync(r.key);
}

// Group 1b: state tokens. Mode-invariant — both modes alias to the same primitive.
const MAP_1B = {
  'state/initializing': 'blue/400', // was blue/500
  'state/running': 'slate/400', // unchanged
  'state/idle': 'slate/500', // unchanged
  'state/waiting': 'amber/400', // unchanged
  'state/pr-open': 'violet/400', // was violet/500
  'state/error': 'red/400', // was red/500
  'state/finished': 'emerald/500', // unchanged
  'state/foreground': 'slate/950', // unchanged
};

const updates = [];
for (const [name, twName] of Object.entries(MAP_1B)) {
  const v = byName.get(name);
  if (!v) return { error: `${name} not found` };
  const target = tw[twName];
  v.setValueForMode(lightModeId, { type: 'VARIABLE_ALIAS', id: target.id });
  v.setValueForMode(darkModeId, { type: 'VARIABLE_ALIAS', id: target.id });
  updates.push({ name, twName });
}

return {
  updatedCount: updates.length,
  updates,
  mutatedNodeIds: updates.map((u) => byName.get(u.name).id),
};
```

Expected: `{ updatedCount: 8 }`.

- [ ] **Step 2: Verify state token aliases**

```js
// use_figma against DsA7QuEa2WthDATkksd1Bq, skillNames: "figma-use"
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const semantic = cols.find((c) => c.name === 'Crew / Semantic Colors');
const allVars = await Promise.all(
  semantic.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)),
);

const EXPECTED = {
  'state/initializing': 'blue/400',
  'state/running': 'slate/400',
  'state/idle': 'slate/500',
  'state/waiting': 'amber/400',
  'state/pr-open': 'violet/400',
  'state/error': 'red/400',
  'state/finished': 'emerald/500',
  'state/foreground': 'slate/950',
};
const lightModeId = semantic.modes.find((m) => /light/i.test(m.name)).modeId;
const darkModeId = semantic.modes.find((m) => /dark/i.test(m.name)).modeId;

const mismatches = [];
for (const [name, expected] of Object.entries(EXPECTED)) {
  const v = allVars.find((av) => av.name === name);
  if (!v) {
    mismatches.push({ name, reason: 'missing' });
    continue;
  }
  for (const [modeId, modeName] of [
    [lightModeId, 'light'],
    [darkModeId, 'dark'],
  ]) {
    const value = v.valuesByMode[modeId];
    if (value?.type !== 'VARIABLE_ALIAS') {
      mismatches.push({ name, mode: modeName, reason: 'not alias' });
      continue;
    }
    const target = await figma.variables.getVariableByIdAsync(value.id);
    if (target?.name !== expected)
      mismatches.push({ name, mode: modeName, expected, actual: target?.name });
  }
}
return { passed: mismatches.length === 0, mismatches };
```

Expected: `{ passed: true }`.

- [ ] **Step 3: Take a screenshot of the StateBadge component set to visually confirm new color values**

```js
// use_figma against DsA7QuEa2WthDATkksd1Bq, skillNames: "figma-use"
const setNode = await figma.getNodeByIdAsync('20:23'); // StateBadge component set
return { shot: await setNode.screenshot({ scale: 2 }) };
```

Visually verify:

- `state=initializing` pill is now slightly lighter blue (was 500, now 400)
- `state=pr-open` pill is now slightly lighter purple
- `state=error` pill is now slightly lighter red
- Other 4 state pills (running, idle, waiting, finished) look unchanged

The pill structure (tinted bg + matching border/text/dot) stays correct — only the underlying color shifts.

### Task A4: Prompt user to publish Crew DS in Figma desktop

**Files:**

- N/A (manual user step)

- [ ] **Step 1: Tell the user to publish**

Message to user verbatim: "Crew Semantic Colors re-aliased (27 variables across groups 1a + 1b). Please **republish Crew Design System** in Figma desktop:

1. Open `Crew Design System` (`DsA7QuEa2WthDATkksd1Bq`) in the Figma desktop app
2. Open the Assets panel → click Publish library
3. Confirm the publish review (should show 27 variable updates)
4. Reply once published"

Wait for user confirmation before proceeding to Phase C.

---

## Phase B — Dashboard CSS update

Code-only changes in `packages/dashboard/src/index.css`. Parallel-safe with Phase A — can run before, during, or after Phase A's Figma work; doesn't depend on the user's Crew DS publish.

### Task B1: Update `.dark` block (group 1a, 19 tokens)

**Files:**

- Modify: `packages/dashboard/src/index.css:70-89`

- [ ] **Step 1: Read the current `.dark` block to confirm line numbers**

```bash
grep -nE "^\s*\.dark\s*\{|^\s*--(background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring)" packages/dashboard/src/index.css | head -30
```

Expected output includes line 70+ for `.dark { ... }`. Confirm before editing.

- [ ] **Step 2: Replace the `.dark` block contents with `var(--color-slate-*)` references**

Use Edit tool. Replace the entire `.dark { ... }` block. The new content (matches Section 2a of the spec):

```css
.dark {
  --background: var(--color-slate-950);
  --foreground: var(--color-slate-200);
  --card: var(--color-slate-900);
  --card-foreground: var(--color-slate-200);
  --popover: var(--color-slate-900);
  --popover-foreground: var(--color-slate-200);
  --primary: var(--color-slate-200);
  --primary-foreground: var(--color-slate-900);
  --secondary: var(--color-slate-800);
  --secondary-foreground: var(--color-slate-200);
  --muted: var(--color-slate-800);
  --muted-foreground: var(--color-slate-400);
  --accent: var(--color-slate-800);
  --accent-foreground: var(--color-slate-200);
  --destructive: var(--color-red-400);
  --destructive-foreground: var(--color-slate-50);
  --border: rgb(255 255 255 / 0.07);
  --input: rgb(255 255 255 / 0.07);
  --ring: var(--color-slate-500);
}
```

(Note: any chart-_, sidebar-_, or other dashboard-specific tokens within the `.dark` block — if present — stay untouched. The grep in Step 1 will surface them; only replace the 19 standard shadcn semantics.)

### Task B2: Update `:root` light-mode block (19 tokens)

**Files:**

- Modify: `packages/dashboard/src/index.css:46-65`

- [ ] **Step 1: Read the current `:root` block**

```bash
sed -n '40,70p' packages/dashboard/src/index.css
```

Confirm the exact OKLCH values currently present and the line range.

- [ ] **Step 2: Replace the `:root` block per Section 2b**

Use Edit tool. New content:

```css
:root {
  /* Light mode primitives — stock Tailwind slate scale (was custom OKLCH approximations of slate). */
  --background: var(--color-white);
  --foreground: var(--color-slate-950);
  --card: var(--color-white);
  --card-foreground: var(--color-slate-950);
  --popover: var(--color-white);
  --popover-foreground: var(--color-slate-950);
  --primary: var(--color-slate-900);
  --primary-foreground: var(--color-slate-50);
  --secondary: var(--color-slate-100);
  --secondary-foreground: var(--color-slate-900);
  --muted: var(--color-slate-100);
  --muted-foreground: var(--color-slate-500);
  --accent: var(--color-slate-100);
  --accent-foreground: var(--color-slate-900);
  --destructive: var(--color-red-500);
  --destructive-foreground: var(--color-slate-50);
  --border: var(--color-slate-200);
  --input: var(--color-slate-200);
  --ring: var(--color-slate-400);
}
```

### Task B3: Update `@theme` state colors (7 tokens)

**Files:**

- Modify: `packages/dashboard/src/index.css:26-32`

- [ ] **Step 1: Replace the 7 `--color-state-*` declarations in `@theme`**

Use Edit tool. Find lines 26-32 currently containing the OKLCH state values, replace with:

```css
--color-state-initializing: var(--color-blue-400);
--color-state-running: var(--color-slate-400);
--color-state-idle: var(--color-slate-500);
--color-state-waiting: var(--color-amber-400);
--color-state-pr-open: var(--color-violet-400);
--color-state-error: var(--color-red-400);
--color-state-finished: var(--color-emerald-500);
```

Preserve surrounding `@theme` content (font, radius, animate declarations).

### Task B4: Lint + format + typecheck

**Files:**

- Modify: (none — verification step)

- [ ] **Step 1: Run dashboard lint**

```bash
npm run -w crew-dashboard lint
```

Expected: passes (no new violations from the CSS edits — they're CSS-only and lint config typically scopes to TS/JS).

- [ ] **Step 2: Run dashboard format**

```bash
npm run -w crew-dashboard format
```

Expected: idempotent or applies prettier formatting. If changes are made, include them in the commit.

- [ ] **Step 3: Run dashboard typecheck**

```bash
npm run -w crew-dashboard typecheck
```

Expected: passes (CSS changes don't affect TS types).

### Task B5: Browser smoke test (dark mode)

**Files:**

- N/A (manual visual verification)

- [ ] **Step 1: Start the dashboard dev server**

```bash
docker compose --profile dev up -d --build --wait
```

Wait for the dashboard to come up at the worktree's dashboard URL (resolve via `crew env --print` or check `<repo>/env.toml`).

- [ ] **Step 2: Open the Agents page in dark mode and check for visual regressions**

Open the dashboard URL in a browser. The page should:

- Show in dark mode by default (per `<html class="dark">` in `main.tsx`)
- Have a slate-tinted dark background (slightly different from before — slate-950 `#020617` instead of custom `#05060a`)
- Cards, popovers, borders, state pills all render visibly
- No FOUC, no missing colors, no console errors

If any element renders with a wrong color or appears unstyled, STOP and inspect. Common gotchas: typo in `var(--color-slate-XXX)`, missing comma, missed line during the Edit.

- [ ] **Step 3: Open agent drawer + agent page full route, smoke test**

Click into an agent row → drawer opens. Then expand to full page (button in drawer header). Verify:

- Drawer surface uses card background (slate-900)
- Timeline event tags (Bash, Read, Edit, Question) show with state-color tints
- State pills in agent header show new \*-400 colors where applicable

### Task B6: Commit Phase B

**Files:**

- Modify: `packages/dashboard/src/index.css`

- [ ] **Step 1: Stage + commit**

```bash
git add packages/dashboard/src/index.css
git commit -m "$(cat <<'EOF'
feat(dashboard): align color tokens to stock Tailwind slate

Replaces custom hex/OKLCH values in :root, .dark, and @theme state-color
declarations with var(--color-slate-*) / var(--color-*-400) references.
Both code (CSS) and design (Crew DS Figma re-aliasing in companion PR)
now reference identical Tailwind shade names — implementation matches
design 1:1 by construction.

Slight visual shift in dark mode: background was custom #05060a, now
slate-950 (#020617 — slightly bluer); state-error / state-pr-open /
state-initializing shift from -500 to -400 shades.

Spec: docs/superpowers/specs/2026-05-10-crew-ds-palette-correction-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — Re-verify migrated frames + close known visual defects

**Blocked by:** Task A4 (user republishes Crew DS).

Mutates the Crew Dashboard Screens Figma file (`9FeJPriqdsdA4n9R5Xsrr8`) and the Crew DS Figma file (`DsA7QuEa2WthDATkksd1Bq` — for the AgentBody fix). Read `figma-design-system-propagation` skill before starting (Trap 4 verification + Trap 1 override stickiness will both fire here).

### Task C1: Verify cache propagation in screens file

**Files:**

- Read: Crew Dashboard Screens (`9FeJPriqdsdA4n9R5Xsrr8`) — pure read

- [ ] **Step 1: Re-import 3 sample tokens and confirm new alias chain ends at `tw/colors/slate`**

```js
// use_figma against 9FeJPriqdsdA4n9R5Xsrr8, skillNames: "figma-use"
const libCols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
const crewSemantic = libCols.find(
  (c) => c.libraryName === 'Crew Design System' && c.name === 'Crew / Semantic Colors',
);
if (!crewSemantic)
  return {
    error: 'Crew Semantic Colors not in linked libs',
    libs: libCols.map((c) => `${c.libraryName}::${c.name}`),
  };

const refs = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(crewSemantic.key);

const SAMPLES = [
  { name: 'background', expectedTarget: 'slate/950' },
  { name: 'state/error', expectedTarget: 'red/400' },
  { name: 'border', expectedTarget: 'white' },
];

const semantic = await figma.variables.getVariableCollectionByIdAsync(
  (await figma.variables.importVariableByKeyAsync(refs.find((r) => r.name === 'background').key))
    .variableCollectionId,
);
const lightModeId = semantic.modes.find((m) => /light/i.test(m.name)).modeId;
const darkModeId = semantic.modes.find((m) => /dark/i.test(m.name)).modeId;

const results = [];
for (const sample of SAMPLES) {
  const ref = refs.find((r) => r.name === sample.name);
  const v = await figma.variables.importVariableByKeyAsync(ref.key);
  const dark = v.valuesByMode[darkModeId];
  if (dark?.type !== 'VARIABLE_ALIAS') {
    results.push({ name: sample.name, fail: 'dark not alias' });
    continue;
  }
  const target = await figma.variables.getVariableByIdAsync(dark.id);
  results.push({
    name: sample.name,
    actualTarget: target?.name,
    expectedTarget: sample.expectedTarget,
    pass: target?.name === sample.expectedTarget,
  });
}

return { allPassed: results.every((r) => r.pass), results };
```

Expected: `{ allPassed: true, results: [...] }`.

If any sample shows the OLD alias target (e.g. `background → neutral/950` instead of `slate/950`), the publish missed Phase A's changes. Tell the user explicitly: "The screens file is still seeing the pre-fix Crew DS — please republish in Figma desktop and confirm the publish review includes the 27 variable updates." Wait for republish, retry.

### Task C2: Re-screenshot + visually verify the 3 migrated frames

**Files:**

- Read: Crew Dashboard Screens (`9FeJPriqdsdA4n9R5Xsrr8`) — pure read via MCP `get_screenshot`

- [ ] **Step 1: Screenshot all 3 migrated frames via MCP `get_screenshot`**

Call MCP `get_screenshot` for each:

- fileKey `9FeJPriqdsdA4n9R5Xsrr8`, nodeId `1:2` (Agents List)
- fileKey `9FeJPriqdsdA4n9R5Xsrr8`, nodeId `1:378` (Drawer Open)
- fileKey `9FeJPriqdsdA4n9R5Xsrr8`, nodeId `1:1900` (Agent Page)

Download each PNG via curl to `$TMPDIR/frame-X-after-palette.png`.

- [ ] **Step 2: Read each screenshot and verify rendering**

For each screenshot, confirm:

- Page bg is the new slate-950 (slightly bluer than the previous neutral-950 dark)
- Card surfaces are slate-900
- Borders show as a subtle white tint (now visible — previously rendered as solid mid-gray which was barely distinguishable from card)
- State pills render with the tinted-pill pattern (bg at 0.18, border + text + dot at full opacity matching state color)

Surface to user: "Frames re-screenshotted post-palette-correction. Visual differences from the previous render: [list]. LMK if anything looks wrong before we move to the visual fixes."

If user reports a visual issue, STOP and triage before continuing to C3/C4/C5.

### Task C3: Fix Inspect button styling on frame `1:2`

**Files:**

- Modify: Crew Dashboard Screens (`9FeJPriqdsdA4n9R5Xsrr8`) — Inspect button text + bg in frame `1:2`

The current Inspect button has solid red bg + dark text (rebound to `state/foreground` during the prior migration as a one-off fix). Should follow the canonical tinted-pill pattern: bg at opacity 0.18, stroke + text at opacity 1.0, all bound to `state/error`.

- [ ] **Step 1: Find the Inspect button by searching for the text node**

```js
// use_figma against 9FeJPriqdsdA4n9R5Xsrr8, skillNames: "figma-use"
const page = figma.root.children.find((p) => p.children.some((c) => c.id === '1:2'));
await figma.setCurrentPageAsync(page);

const frame = await figma.getNodeByIdAsync('1:2');
const inspectTexts = frame.findAll(
  (n) => n.type === 'TEXT' && n.characters.trim().toLowerCase() === 'inspect',
);

const results = [];
for (const t of inspectTexts) {
  // Walk up to find the enclosing button frame (typically named "Button")
  let cur = t.parent;
  while (cur && cur.id !== frame.id) {
    if (cur.name === 'Button') break;
    cur = cur.parent;
  }
  results.push({
    textId: t.id,
    textCharacters: t.characters,
    buttonFrameId: cur?.name === 'Button' ? cur.id : null,
    buttonFrameFills: cur?.fills?.map((f) => ({
      color: f.color,
      opacity: f.opacity,
      boundColorId: f.boundVariables?.color?.id,
    })),
    textFills: t.fills?.map((f) => ({
      color: f.color,
      opacity: f.opacity,
      boundColorId: f.boundVariables?.color?.id,
    })),
  });
}

return { results };
```

Expected: 1 result with the Inspect text node and its enclosing Button frame. If 0 results, the Inspect text was renamed or the structure changed — STOP and inspect manually.

- [ ] **Step 2: Apply tinted-pill pattern to the button**

```js
// use_figma against 9FeJPriqdsdA4n9R5Xsrr8, skillNames: "figma-use"
// Replace TEXT_ID and BUTTON_FRAME_ID with the IDs from Step 1
const TEXT_ID = '<from step 1>';
const BUTTON_FRAME_ID = '<from step 1>';

// Preload fonts
for (const t of figma.currentPage.findAll((n) => n.type === 'TEXT')) {
  for (let i = 0; i < t.characters.length; i++) {
    const f = t.getRangeFontName(i, i + 1);
    if (typeof f === 'object' && f.family) await figma.loadFontAsync(f);
  }
}

// Import state/error from Crew DS team library
const libCols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
const crewSemantic = libCols.find(
  (c) => c.libraryName === 'Crew Design System' && c.name === 'Crew / Semantic Colors',
);
const refs = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(crewSemantic.key);
const stateError = await figma.variables.importVariableByKeyAsync(
  refs.find((r) => r.name === 'state/error').key,
);

const button = await figma.getNodeByIdAsync(BUTTON_FRAME_ID);
const text = await figma.getNodeByIdAsync(TEXT_ID);

// Bg fill: state/error at opacity 0.18
button.fills = button.fills.map((f) => {
  if (f.type !== 'SOLID') return f;
  const bound = figma.variables.setBoundVariableForPaint(f, 'color', stateError);
  return { ...bound, opacity: 0.18 };
});
// Stroke (if present): state/error at opacity 1.0
if (Array.isArray(button.strokes) && button.strokes.length > 0) {
  button.strokes = button.strokes.map((s) => {
    if (s.type !== 'SOLID') return s;
    const bound = figma.variables.setBoundVariableForPaint(s, 'color', stateError);
    return { ...bound, opacity: 1 };
  });
}
// Text fill: state/error at opacity 1.0
text.fills = text.fills.map((f) => {
  if (f.type !== 'SOLID') return f;
  const bound = figma.variables.setBoundVariableForPaint(f, 'color', stateError);
  return { ...bound, opacity: 1 };
});

return { mutatedNodeIds: [BUTTON_FRAME_ID, TEXT_ID] };
```

- [ ] **Step 3: Screenshot the latency row (containing the Inspect button) to verify**

Use MCP `get_screenshot` against the latency row's parent frame (or the entire `1:2` frame), download, read. Expect: Inspect button now shows tinted-red bg + visible red border + readable red text (matching the state pill pattern).

### Task C4: Fix AgentBody composite (Crew DS node `24:2`)

**Files:**

- Modify: Crew DS Figma file (`DsA7QuEa2WthDATkksd1Bq`) — `AgentBody` composite (node `24:2`)

The `AgentBody` composite was built with a hand-rolled ellipse + text rather than composing a real `StateBadge` instance. Doesn't pick up StateBadge updates. Fix by deleting the hand-built pill and inserting a real instance.

- [ ] **Step 1: Inspect the current AgentBody pill structure**

```js
// use_figma against DsA7QuEa2WthDATkksd1Bq, skillNames: "figma-use"
const agentBody = await figma.getNodeByIdAsync('24:2');
if (!agentBody) return { error: 'AgentBody not found at 24:2' };

// Find the hand-rolled pill: typically a frame with an ellipse + text inside, NOT an instance
const candidates = agentBody.findAll(
  (n) =>
    (n.type === 'FRAME' || n.type === 'RECTANGLE') &&
    /pill|state|badge|status/i.test(n.name) &&
    n.findAll((c) => c.type === 'TEXT').length > 0,
);

const inspect = candidates.map((c) => ({
  id: c.id,
  type: c.type,
  name: c.name,
  parentId: c.parent?.id,
  parentName: c.parent?.name,
  parentLayoutMode: c.parent?.layoutMode,
  x: c.x,
  y: c.y,
  textChild: c.findAll((t) => t.type === 'TEXT')[0]?.characters,
  isInstance: c.type === 'INSTANCE',
}));

return { candidateCount: candidates.length, candidates: inspect };
```

Expected: at least 1 candidate. The first hand-rolled pill is the target. Note its `id`, `parentId`, `parentLayoutMode`, position, and `textChild` (which will determine the StateBadge variant to swap in).

- [ ] **Step 2: Replace with a real StateBadge instance**

```js
// use_figma against DsA7QuEa2WthDATkksd1Bq, skillNames: "figma-use"
// Replace PILL_ID, PARENT_ID, PARENT_LAYOUT_MODE, PILL_X, PILL_Y, STATE_NAME from Step 1
const PILL_ID = '<from step 1>';
const PARENT_ID = '<from step 1>';
const PARENT_LAYOUT_MODE = '<from step 1, e.g. NONE or VERTICAL>';
const PILL_X = 0; // from step 1
const PILL_Y = 0; // from step 1
const STATE_NAME = 'waiting'; // derive from textChild (e.g. "Waiting" → "waiting")

// Preload fonts
for (const t of figma.currentPage.findAll((n) => n.type === 'TEXT')) {
  for (let i = 0; i < t.characters.length; i++) {
    const f = t.getRangeFontName(i, i + 1);
    if (typeof f === 'object' && f.family) await figma.loadFontAsync(f);
  }
}

// Get the StateBadge component set (local in Crew DS)
const stateBadgeSet = await figma.getNodeByIdAsync('20:23');
const variant = stateBadgeSet.children.find(
  (v) => v.type === 'COMPONENT' && v.name === `state=${STATE_NAME}`,
);
if (!variant) return { error: `state=${STATE_NAME} variant not found` };

const pill = await figma.getNodeByIdAsync(PILL_ID);
const parent = await figma.getNodeByIdAsync(PARENT_ID);

const inst = variant.createInstance();
const idx = parent.children.indexOf(pill);
parent.insertChild(idx >= 0 ? idx : parent.children.length, inst);
if (!PARENT_LAYOUT_MODE || PARENT_LAYOUT_MODE === 'NONE') {
  inst.x = PILL_X;
  inst.y = PILL_Y;
}
pill.remove();

return { newInstanceId: inst.id, mutatedNodeIds: [PARENT_ID, inst.id] };
```

- [ ] **Step 3: Screenshot AgentBody to verify**

```js
// use_figma against DsA7QuEa2WthDATkksd1Bq, skillNames: "figma-use"
const agentBody = await figma.getNodeByIdAsync('24:2');
return { shot: await agentBody.screenshot({ scale: 2 }) };
```

Verify the embedded pill renders with the tinted-pill pattern (matches the canonical StateBadge variants in the Crew DS Composites page).

- [ ] **Step 4: Prompt user to republish Crew DS**

Message to user: "AgentBody composite updated to embed a real StateBadge instance. Please **republish Crew DS** in Figma desktop again so the screens file picks up the AgentBody change."

Wait for confirmation.

- [ ] **Step 5: Re-screenshot frame 1:378 (which uses AgentBody) to verify it now renders correctly in the screens file**

Use MCP `get_screenshot` for frame `1:378`. Download, read, confirm: the agent-detail drawer's state pill (in the drawer header) now renders as a tinted pill, not a solid block.

If still solid: per `figma-design-system-propagation` skill Trap 1, the AgentBody instance in the screens file may have stale instance overrides. Apply Trap 1's explicit-mutation fix.

### Task C5: Visual audit pass

**Files:**

- Read: Crew DS (`DsA7QuEa2WthDATkksd1Bq`) and Crew Dashboard Screens (`9FeJPriqdsdA4n9R5Xsrr8`) — screenshots
- Modify: depends on findings

- [ ] **Step 1: Screenshot all 10 Crew DS composites + 3 migrated frames**

Via MCP `get_screenshot`:

- Crew DS composites (file `DsA7QuEa2WthDATkksd1Bq`): `19:3` (BrandMark), `20:23` (StateBadge set), `21:2` (TopNav), `21:9` (AgentRow), `21:21` (ProjectSection), `21:25` (AgentsList), `24:2` (AgentBody), `25:4` (StateHistoryBar), `26:4` (TokenTable), `27:4` (ViewportFrame)
- Migrated frames (file `9FeJPriqdsdA4n9R5Xsrr8`): `1:2`, `1:378`, `1:1900`

Download all 13 to `$TMPDIR/audit-<id>.png`.

- [ ] **Step 2: Walk the user through each screenshot**

Surface each to the user: "Audit screenshot N of 13: [composite name / frame name]. Anything off here?"

Capture user feedback per screenshot. For each issue raised:

- Triage: fix-now (within scope of Phase C) vs defer (add to followup)
- For fix-now items: write a use_figma script targeting the issue, verify with re-screenshot
- For defer items: append to `docs/followups.md` per the followup-detection convention in user-level CLAUDE.md

- [ ] **Step 3: Surface unfixable issues as followups**

For any issue triaged as "defer" — append a structured entry to `docs/followups.md` Active section. Use the entry template from the user's CLAUDE.md "Followup detection" section.

### Task C6: Commit Phase C work

**Files:**

- Modify: `docs/followups.md` (if any defers were captured)

Most of Phase C is Figma file mutations (no git diff). Commit only the `docs/followups.md` updates if any were made.

- [ ] **Step 1: Stage + commit (only if `docs/followups.md` changed)**

```bash
git status --short
# If docs/followups.md is modified:
git add docs/followups.md
git commit -m "$(cat <<'EOF'
docs(followups): defers from palette-correction visual audit

Captures issues surfaced during the post-palette-correction visual audit
that don't fit Phase C's scope.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

If `docs/followups.md` is unchanged, skip the commit.

---

## Phase D — Doc + skill updates

**Parallel-safe with Phase C** (can run any time after Phase A is complete; doesn't depend on user republish or visual audit).

### Task D1: Update `docs/plans/design-system.md`

**Files:**

- Modify: `docs/plans/design-system.md`

- [ ] **Step 1: Replace the "v1 overrides — None for v1" section**

Currently the section starts with "None for v1. The dashboard's existing dark slate aesthetic matches Core's shadcn-default `mode/dark mode` values closely enough that a delta layer isn't needed yet."

Replace with a new "v1 overrides — direct alias to slate" subsection that:

- States Crew DS aliases all standard shadcn semantics (group 1a, 19 vars) and state tokens (group 1b, 8 vars) directly to `Core / tw/colors / slate-XXX` (or `red-400`, `white`, etc.) — bypassing Core's `mode` collection
- Includes the full mapping table from Section 1a + 1b of the spec
- Notes the architectural side-effect: Crew DS becomes the single source of mode resolution; Trap 2 from the propagation skill no longer applies to Crew consumers
- Lists the deferred groups (1c chart, 1d sidebar, 1e kit-extras) with rationale (unused at runtime; address when first usage appears)

- [ ] **Step 2: Update the "Mode resolution" subsection**

Currently says: "Mode resolution chains `Crew / Semantic Colors → Core / mode → Core / tw/colors`. Because the chain crosses two collections, consumer frames must set the mode on **both** Crew and Core for theming to track end-to-end."

Replace with: "Mode resolution chains `Crew / Semantic Colors → Core / tw/colors` directly (as of 2026-05-10 palette correction). Because `tw/colors` is mode-invariant, consumer frames only need to set explicit mode on `Crew / Semantic Colors` — the underlying primitive doesn't change with mode. Light/dark differentiation comes from Crew DS's per-mode aliasing (currently both modes alias to the same slate shade; future light-mode design pass would change the light-mode aliases)."

- [ ] **Step 3: Add an "Extending the palette" subsection**

After the v1 overrides section, add a new "Extending the palette" subsection documenting the three patterns from the spec's "Future-extensibility patterns":

- **Pattern 1**: color already in Tailwind (use directly, no infrastructure)
- **Pattern 2**: brand-new custom color (extend `@theme` in CSS, create `Crew / Primitives` collection in Figma JIT)
- **Pattern 3**: custom semantic on existing Tailwind value (alias in both CSS `@theme` and Crew Semantic Colors)

Use the same wording as the spec for each pattern's "CSS" + "Figma" + "convention" lines.

### Task D2: Update `figma-design-system-propagation` skill

**Files:**

- Modify: `~/.claude/skills/figma-design-system-propagation/SKILL.md`

- [ ] **Step 1: Add exception note to Trap 2**

Find the "Trap 2 — Mode collections don't auto-cascade across alias chains" section. Append after the "Generalize:" paragraph:

```markdown
**Exception — direct alias to mode-invariant primitive.** If your override layer's variables alias directly to a mode-invariant primitive collection (like `tw/colors`, single-mode) instead of through a multi-mode source collection (like `mode`), only one mode set is needed: the override collection. Crew DS adopted this pattern on 2026-05-10 — Crew Semantic Colors aliases directly to `Core / tw/colors / slate-XXX`, so Crew consumers only need `setExplicitVariableModeForCollection(crewSemantic, modeId)`. No need to walk the alias chain to set mode on the primitive collection (it has no mode to set).

How to tell which pattern your project uses: pick a known override variable (e.g. `Crew / Semantic Colors / background`), inspect its `valuesByMode[anyModeId]`. If the alias target is in a single-mode collection (modes.length === 1), you're in the simplified pattern. If multi-mode (modes.length >= 2), the chain-walking applies.
```

### Task D3: Update `figma-screen-migration` skill

**Files:**

- Modify: `~/.claude/skills/figma-screen-migration/SKILL.md`

- [ ] **Step 1: Add exception note to Phase 2 (Set modes)**

Find the "Phase 2 — Set modes (cross-collection)" section. Append:

```markdown
**Exception:** if the project's design system aliases its override layer directly to mode-invariant primitives (single-mode collections like `tw/colors`), Phase 2 only needs to set mode on the override collection — no chain-walking needed. Check the project's `docs/plans/design-system.md` for the Mode resolution subsection. Crew DS uses this simplified pattern as of 2026-05-10.
```

### Task D4: Add project memory entry

**Files:**

- Create: `~/.claude/projects/-home-safturento-Repos-crew/memory/project_crew_ds_palette_strategy.md`
- Modify: `~/.claude/projects/-home-safturento-Repos-crew/memory/MEMORY.md`

- [ ] **Step 1: Create the new memory file**

Path: `~/.claude/projects/-home-safturento-Repos-crew/memory/project_crew_ds_palette_strategy.md`

Content:

```markdown
---
name: Crew DS uses direct-alias-to-tw/colors-slate strategy (since 2026-05-10)
description: Crew Semantic Colors aliases directly to Core's tw/colors/slate primitives (skipping Core's mode collection). Single-source-of-mode-resolution. Three patterns for future palette extensions.
type: project
---

Crew DS palette correction (2026-05-10) re-aliased 27 Crew Semantic Colors variables (19 standard shadcn semantics + 8 state tokens) to point directly at Core's `tw/colors` collection (e.g. `background → tw/colors/slate-950`, `state/error → tw/colors/red-400`, `border → tw/colors/white`). This bypasses Core's `mode` collection entirely.

**Why:** the dashboard's `.dark` block in `packages/dashboard/src/index.css` was custom blue-tinted slate hex values; Crew DS via Core's mode collection resolved to `neutral` (pure grayscale). Palette mismatch. The CREW-122 assumption "shadcn defaults match closely enough" was invalidated by the actual values.

**How to apply:**

- **Mode resolution is single-collection.** Setting explicit dark mode on a frame in the screens file only requires `setExplicitVariableModeForCollection(crewSemantic, darkModeId)`. Don't try to walk the alias chain to also set Core's mode — Crew aliases bypass it. The propagation skill's Trap 2 has an exception note for this case.
- **Both code and design reference identical Tailwind shade names** (e.g. `slate-950`, `red-400`). Designer says "I used `bg-warning`" → developer ships `bg-warning` → no translation step. Convention: Tailwind class name in code matches variable name in Figma.
- **Three patterns for future palette extensions** (documented in design-system.md "Extending the palette" subsection):
  1. Color already in Tailwind (`blue-500` etc.) — use directly, no new infrastructure
  2. Brand-new custom color (e.g. `brand-purple = #5b21b6`) — extend `@theme` block in CSS, create `Crew / Primitives` collection in Figma JIT
  3. Custom semantic on existing Tailwind value (e.g. `warning = blue-500`) — alias in both CSS `@theme` and Crew Semantic Colors
- **Deferred groups stay aliased through Core's mode collection** (chart-1..5, sidebar-\*, kit-extras). They're unused at runtime; address when first usage appears.

**Reference:**

- Spec: `docs/superpowers/specs/2026-05-10-crew-ds-palette-correction-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-crew-ds-palette-correction.md`
- Updated `docs/plans/design-system.md` "v1 overrides" + "Mode resolution" + "Extending the palette" subsections
```

- [ ] **Step 2: Add an entry to `MEMORY.md`**

Append to `~/.claude/projects/-home-safturento-Repos-crew/memory/MEMORY.md` (under existing entries):

```markdown
- [Crew DS direct-alias-to-slate strategy](project_crew_ds_palette_strategy.md) — Crew Semantic Colors aliases directly to tw/colors/slate (skipping Core mode); single-source mode resolution; 3 patterns for future palette extensions
```

### Task D5: Commit Phase D

**Files:**

- Modify: `docs/plans/design-system.md`
- Modify: `~/.claude/skills/figma-design-system-propagation/SKILL.md`
- Modify: `~/.claude/skills/figma-screen-migration/SKILL.md`
- Modify: `~/.claude/projects/-home-safturento-Repos-crew/memory/MEMORY.md`
- Create: `~/.claude/projects/-home-safturento-Repos-crew/memory/project_crew_ds_palette_strategy.md`

The skill files + memory file are in `~/.claude/`, **outside this repo**. They aren't committed via git in this repo — they're personal/global files. Commit only `docs/plans/design-system.md` here.

- [ ] **Step 1: Stage + commit the design-system.md update**

```bash
git add docs/plans/design-system.md
git commit -m "$(cat <<'EOF'
docs(design-system): direct-alias-to-slate strategy + extension patterns

Replaces the 'v1 overrides — None' claim with the new direct-alias
architecture (Crew Semantic Colors → tw/colors/slate, bypassing Core's
mode collection). Updates the Mode resolution subsection to reflect the
single-collection chain. Adds an 'Extending the palette' subsection
documenting the three patterns for future palette additions.

Spec: docs/superpowers/specs/2026-05-10-crew-ds-palette-correction-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

The skill files in `~/.claude/skills/` and the memory entry in `~/.claude/projects/.../memory/` are **not** committed via git. Per user's global CLAUDE.md ("Don't ticket — handle manually"), user-level skills can't run through `crew run` and their changes live outside the project repo. They're updated directly via Edit/Write.

---

## Plan-level acceptance criteria

Re-stated from the spec for plan-level tracking:

- [ ] Phase A (Tasks A1–A4) complete: 19 group-1a variables + 8 group-1b variables re-aliased; user has republished Crew DS
- [ ] Phase B (Tasks B1–B6) complete: 19 `.dark` + 19 `:root` + 7 `@theme` state tokens updated in dashboard CSS; lint/format/typecheck pass; browser smoke test confirms no regressions
- [ ] Phase C (Tasks C1–C6) complete: cache verification passes (Trap 4); 3 migrated frames re-screenshot and look correct; Inspect button follows tinted-pill pattern; AgentBody embeds real StateBadge instance; visual audit done with all issues either fixed or deferred to followups
- [ ] Phase D (Tasks D1–D5) complete: design-system.md updated; both skills (propagation + migration) amended; project memory entry added
- [ ] No regressions in dashboard dev server when running in dark mode

## Out of scope (re-stated)

- Vertical-slice work for the remaining 8 frames (Epic 2)
- QuickAction button wiring to daemon endpoints
- ErrorFallback composite (the 11th composite, still unbuilt)
- Composite skeleton-fidelity → pixel-fidelity polish (deferred to opportunistic work in vertical slices)
- Light-mode-deep design pass (dashboard ships dark-only at runtime)
- Modifying Core (the kit fork)
