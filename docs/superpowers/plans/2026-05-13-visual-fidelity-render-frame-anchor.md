# Visual-fidelity-check render-frame anchor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-anchor the `visual-fidelity-check` skill on render composites (TopNav, AgentRow, etc.) instead of component sets (Pill set 272:120), so the gate catches "wrong variant chosen" encoding errors that have slipped through three prior CREW-135 attempts.

**Architecture:** Three load-bearing changes plus a placement correction. (1) `figma-snapshot`'s Plugin-API enrichment script walks each composite's tree and emits per-instance `variantOverrides` + `componentPropertyOverrides` + `resolvedStyles` as data. (2) Skill workflow Step 4 walks `caller → .figma.tsx → render composite → nested instance → variant overrides`. (3) Skill SKILL.md gains a "set vs composite" anti-loophole and a pre-authoring rule; the example rewrites against the actual New Run case. (4) *(obsolete — see the reconciliation banner)* a placement correction CREW-169 has since shipped; the skill lives at `<repo>/.claude/skills/` and the injection module is load-bearing, **not** deleted.

**Tech Stack:** TypeScript (Node 24, ESM, vitest), figma-snapshot Plugin-API enrichment, Claude Code project-level skill discovery, markdown skill content.

> **Spec:** [`docs/superpowers/specs/2026-05-13-visual-fidelity-render-frame-anchor.md`](../specs/2026-05-13-visual-fidelity-render-frame-anchor.md) (PR #197).

> **RECONCILED 2026-05-16 (visual-fidelity close-out).** This plan predates Epic CREW-169 and
> was authored but never merged. Reconciled as part of the close-out:
> **Phase 1 is obsolete** — CREW-169 already moved the skill to `<repo>/.claude/skills/`, and
> the injection module Phase 1 planned to delete is load-bearing; CREW-149 was closed obsolete.
> **Phase 3** now also carries the chrome live-DOM Step 5 rewrite (Tasks 3.4–3.5, absorbed from
> CREW-146 PR B). **Phase 4** — Task 4.1 copies the committed `.crew/figma-snapshot/` artifact
> into the crew-135 fixture (post-CREW-173 it is git-tracked, not generated pre-dispatch);
> Task 4.2 applies the frozen patch `crew-135/pr-193.patch`, not a live `CREW-135` branch.
> See `docs/superpowers/specs/2026-05-16-visual-fidelity-closeout-design.md` and
> `docs/superpowers/specs/2026-05-17-figma-snapshot-committed-artifact-design.md`.

---

## Phase boundaries and parallelism

Four phases, three of which can run partly in parallel:

| Phase | Covers | Depends on |
|---|---|---|
| ~~**P1**~~ | ~~§8 placement correction~~ — **OBSOLETE (CREW-149 closed; see banner)** | — |
| **P2** | §1 figma-snapshot enrichment + tests | nothing |
| **P3** | §2–§5 skill content edits + chrome live-DOM Step 5 (workflow / SKILL.md / example) | nothing (skill path already final) |
| **P4** | §6 migration (fixture refresh) + §7 validation | P2 (data shape) + P3 (skill rules) |

P2 and P3 are independent and can ship in parallel. P4 is the last step. (Phase 1 is obsolete — see the reconciliation banner.)

## File responsibilities

After this plan ships, these files will look as follows:

```
.claude/skills/visual-fidelity-check/
├── SKILL.md                                  ← anti-loophole + pre-authoring sections added
├── workflow.md                               ← Step 4 rewritten with sub-flow + severity rules
└── examples/
    ├── findings-report-example.md            ← Finding 4 rewritten using New Run case
    └── good-report-example.md                ← unchanged

packages/cli/src/lib/figma-snapshot/
├── enrichment-prompt.ts                      ← script walks tree, emits componentInstances[]
└── enrichment-prompt.test.ts                 ← new tests for nested-walk behavior

# Phase 1's "DELETED in P1" list is OBSOLETE — skill-injection.ts and skill-injection-step.ts
# are load-bearing (the dispatcher injects crew-owned skills into every target worktree) and
# were NOT deleted. See the reconciliation banner at the top of this plan.

docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/composites/
                                              ← replaced wholesale with full render-composite set
```

---

## Phase 1: Placement correction (§8)

> **OBSOLETE — do not implement.** Phase 1 (CREW-149) was closed obsolete on 2026-05-16.
> CREW-169 already moved the skill to `<repo>/.claude/skills/`; the injection module Phase 1
> planned to delete is load-bearing (see `docs/rationale/architecture.md`). Tasks 1.1–1.5 are
> retained below for history only. See `docs/superpowers/specs/2026-05-16-visual-fidelity-closeout-design.md`.

Move the skill to `<repo>/.claude/skills/visual-fidelity-check/` and delete CREW-144's dispatcher-injection module. Independent of all other phases; ships first so subsequent skill edits land at the final path.

### Task 1.1: Move skill source-of-truth into `.claude/skills/`

**Files:**
- Move: `packages/cli/src/lib/skills/visual-fidelity-check/` → `.claude/skills/visual-fidelity-check/`

- [ ] **Step 1: Verify destination is clear**

Run: `ls .claude/skills/ 2>/dev/null || echo "missing"`
Expected: either `missing` (no directory yet) or a list that does NOT contain `visual-fidelity-check`. If it does contain it, stop and surface the conflict — the in-place destination already has files and the move would clobber.

- [ ] **Step 2: Move the directory**

```bash
mkdir -p .claude/skills
git mv packages/cli/src/lib/skills/visual-fidelity-check .claude/skills/visual-fidelity-check
```

- [ ] **Step 3: Confirm the move**

Run: `ls .claude/skills/visual-fidelity-check/`
Expected:
```
SKILL.md
examples
workflow.md
```

Run: `ls packages/cli/src/lib/skills/ 2>/dev/null`
Expected: empty (the parent dir is now empty — we delete it in Step 4).

- [ ] **Step 4: Remove the now-empty parent directory**

```bash
rmdir packages/cli/src/lib/skills
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/visual-fidelity-check packages/cli/src/lib/skills
git commit -m "refactor(skills): move visual-fidelity-check to .claude/skills/

Per the render-frame-anchor spec §8: the B1.2 dispatcher-injection
architecture solved a sandbox-write concern that doesn't apply to
Claude Code's read-only project-skill discovery. Moving the skill
under .claude/skills/ lets git worktree checkout deliver it to every
worktree automatically, removing the need for per-dispatch injection.

Subsequent commits delete the now-unused injection module."
```

### Task 1.2: Delete `skill-injection.ts` and its test

**Files:**
- Delete: `packages/cli/src/lib/run/skill-injection.ts`
- Delete: `packages/cli/src/lib/run/skill-injection.test.ts`

- [ ] **Step 1: Confirm nothing else imports skill-injection**

Run: `grep -rn "skill-injection" packages/cli/src --include="*.ts" | grep -v "skill-injection\.ts\|skill-injection\.test\.ts\|skill-injection-step"`
Expected: empty output. (Only `skill-injection-step.ts` and the run.ts call site should reference it; the call site is removed in Task 1.4.)

If there are unexpected references, stop and add them to the deletion list before proceeding.

- [ ] **Step 2: Delete the files**

```bash
git rm packages/cli/src/lib/run/skill-injection.ts packages/cli/src/lib/run/skill-injection.test.ts
```

- [ ] **Step 3: Confirm deletions**

Run: `ls packages/cli/src/lib/run/skill-injection* 2>/dev/null`
Expected: still shows `skill-injection-step.ts` and `skill-injection-step.test.ts` (deleted in Task 1.3).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(run): delete skill-injection helpers

Source-of-truth for visual-fidelity-check moved to .claude/skills/
in the prior commit. The dispatcher no longer needs to materialize
skill files into worktrees — git checkout handles that natively.

skillsApplicableTo() and copySkillIntoWorktree() have no remaining
callers after skill-injection-step.ts (next commit) and run.ts
(later commit) drop their references."
```

### Task 1.3: Delete `skill-injection-step.ts` and its test

**Files:**
- Delete: `packages/cli/src/lib/run/skill-injection-step.ts`
- Delete: `packages/cli/src/lib/run/skill-injection-step.test.ts`

- [ ] **Step 1: Delete the files**

```bash
git rm packages/cli/src/lib/run/skill-injection-step.ts packages/cli/src/lib/run/skill-injection-step.test.ts
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(run): delete skill-injection-step pre-dispatch hook

The pre-dispatch step that copied each applicable skill into the
worktree's .claude/skills/<name>/ is no longer needed — the worktree
checkout from .claude/skills/ in the canonical repo delivers the
same content. Next commit removes run.ts's call site."
```

### Task 1.4: Remove `runSkillInjection` call from run.ts

**Files:**
- Modify: `packages/cli/src/commands/run.ts` — remove import (line 52), remove call site (lines 353-360), remove `skillsSourceRoot()` helper (lines 578-583 in current main; adjust as needed)
- Modify: `packages/cli/src/lib/run/index.ts` — remove `export * from './skill-injection-step.js'` (line 9 in current main)

- [ ] **Step 1: Remove import in run.ts**

Open `packages/cli/src/commands/run.ts`. Remove `runSkillInjection,` from the import block (currently around line 52):

```diff
   runPreDispatchFigmaSnapshot,
-  runSkillInjection,
   runVerifyGate,
```

- [ ] **Step 2: Remove the call site in run.ts**

Same file, remove the block currently around lines 353-360:

```diff
     console.log(pc.dim('→ generating Figma snapshot for visual-fidelity verification…'));
     await runPreDispatchFigmaSnapshot({
       worktree,
       config,
       log: (msg) => console.log(pc.dim(`    ${msg}`)),
       warn: (msg) => console.warn(pc.yellow(`  ! ${msg}`)),
     });
-
-    console.log(pc.dim('→ injecting dispatcher-managed skills into the worktree…'));
-    await runSkillInjection({
-      worktree,
-      config,
-      sourceRoot: skillsSourceRoot(),
-      log: (msg) => console.log(pc.dim(`    ${msg}`)),
-      warn: (msg) => console.warn(pc.yellow(`  ! ${msg}`)),
-    });
   }
```

- [ ] **Step 3: Remove the `skillsSourceRoot()` helper**

Same file. Find the helper currently around lines 578-583 and delete it along with its `function` declaration line + closing brace:

```diff
- /**
-  * CLI runs via tsx against the source tree (no compiled `dist/`), so we
-  * resolve relative to this module's source location at runtime.
-  */
- function skillsSourceRoot(): string {
-   return join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'skills');
- }
-
```

Check whether `dirname` and `fileURLToPath` are still used elsewhere in run.ts. Run:

```bash
grep -n "dirname\|fileURLToPath" packages/cli/src/commands/run.ts
```

If neither is used elsewhere, also remove their imports from the top of the file:

```diff
- import { dirname } from 'node:path';
- import { fileURLToPath } from 'node:url';
```

(Note: `dirname` may be imported as `import { dirname, join } from 'node:path'` — only remove `dirname` if `join` is still used elsewhere.)

- [ ] **Step 4: Remove the re-export in run/index.ts**

Open `packages/cli/src/lib/run/index.ts`. Remove the line at ~9:

```diff
- export * from './skill-injection-step.js';
```

- [ ] **Step 5: Run the test suite to confirm nothing else broke**

Run: `npm run test --workspace=crew-cli`
Expected: PASS for every test file. (The tests for skill-injection.ts and skill-injection-step.ts have already been deleted in Tasks 1.2/1.3; nothing else should reference these modules.)

If anything fails, the failure indicates a missed call site — find it via `grep -rn "runSkillInjection\|skillsApplicableTo\|copySkillIntoWorktree" packages/cli/src` and remove.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck --workspace=crew-cli`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/run.ts packages/cli/src/lib/run/index.ts
git commit -m "refactor(run): drop skill-injection wiring from run.ts

Removes the import, the pre-dispatch call site, the skillsSourceRoot()
helper, and the index.ts re-export. The visual-fidelity-check skill
is now delivered by checkout from .claude/skills/, matching how every
other project-level skill works in Claude Code."
```

### Task 1.5: Verify the placement works end-to-end

**Files:** None modified — verification step only.

- [ ] **Step 1: Confirm the skill discovers from the new location**

Run: `grep -rn "readSkillsFromRoot" packages/cli/src/lib/prompts/skills.ts`
Expected: a call that points at `<repo>/.claude/skills/` (or `join(opts.repoPath, '.claude', 'skills')`). This is the existing project-level discovery — no code change needed.

- [ ] **Step 2: Smoke-render a ticket prompt and confirm the skill shows up**

The skill rendering logic lives in `packages/cli/src/lib/prompts/skills.ts`. There's an existing unit test for the discovery; ensure it still passes:

Run: `npm run test --workspace=crew-cli -- --run skills.test`
Expected: PASS.

- [ ] **Step 3: Push the phase**

```bash
git push
```

Confirm CI passes on the branch.

---

## Phase 2: figma-snapshot enrichment (§1)

Extend the Plugin-API enrichment script to walk each composite's tree and emit per-instance variant overrides. Independent of Phase 1; can ship in parallel.

### Task 2.1: Decide the data shape via failing test

**Files:**
- Modify: `packages/cli/src/lib/figma-snapshot/enrichment-prompt.test.ts`

- [ ] **Step 1: Write the failing test for nested-instance walk in the prompt**

Append a new `describe` block to `packages/cli/src/lib/figma-snapshot/enrichment-prompt.test.ts`:

```typescript
describe('buildEnrichmentPrompt — nested-instance walk', () => {
  it('embeds a depth-bounded recursive walk in the Plugin-API script', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    // The script should iterate children and accumulate componentInstances entries.
    expect(prompt).toContain('componentInstances');
    expect(prompt).toContain('walkChildren');
    // Depth cap at 6 per spec §1.
    expect(prompt).toMatch(/depth\s*[<>=]\s*6/);
  });

  it("script emits each nested instance's mainComponent set id and variantOverrides", () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    // Each emitted entry must carry these fields per spec §1.
    expect(prompt).toContain('mainComponentSetId');
    expect(prompt).toContain('variantOverrides');
    expect(prompt).toContain('componentPropertyOverrides');
    expect(prompt).toContain('resolvedStyles');
    expect(prompt).toContain('path');
  });

  it("script captures Has Icon, Icon, Label overrides for INSTANCE_SWAP and TEXT props", () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    // The script must keep the existing INSTANCE_SWAP resolution and capture Label/Has Icon.
    expect(prompt).toContain('INSTANCE_SWAP');
    // Property-name normalization (strip `#nodeId` suffix) is already in place; keep it.
    expect(prompt).toContain(".split('#')[0]");
  });

  it("script halts walk at depth 6 with a warning marker", () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    // Surface a depth warning entry rather than silently truncating.
    expect(prompt).toContain('depthExceeded');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=crew-cli -- --run enrichment-prompt`
Expected: FAIL — four new tests failing because the strings `componentInstances`, `walkChildren`, `mainComponentSetId`, etc. are not yet in the prompt.

### Task 2.2: Extend the enrichment script

**Files:**
- Modify: `packages/cli/src/lib/figma-snapshot/enrichment-prompt.ts`

- [ ] **Step 1: Replace the `ENRICHMENT_SCRIPT` constant**

In `enrichment-prompt.ts`, replace the current `ENRICHMENT_SCRIPT` (lines 51-147) with this version. The new version keeps the existing per-node `enrichment` shape and adds a recursive walk that emits a `componentInstances` array on every composite.

```javascript
const ENRICHMENT_SCRIPT = `const ids = <NODE_IDS_JSON>;
const out = {};
const MAX_DEPTH = 6;

async function paintTokenAlias(paint) {
  if (!paint || !paint.boundVariables || !paint.boundVariables.color || !paint.boundVariables.color.id) {
    return null;
  }
  const varId = paint.boundVariables.color.id;
  try {
    const v = await figma.variables.getVariableByIdAsync(varId);
    if (!v) return { variableId: varId, variableName: null, resolvedAlias: null, resolvedHex: null };
    const chain = [v.name];
    const c0 = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
    let val = c0 ? v.valuesByMode[c0.defaultModeId || c0.modes[0].modeId] : null;
    let hops = 0;
    while (val && typeof val === 'object' && 'id' in val && val.type === 'VARIABLE_ALIAS' && hops < 5) {
      hops++;
      const next = await figma.variables.getVariableByIdAsync(val.id);
      if (!next) break;
      chain.push(next.name);
      const nc = await figma.variables.getVariableCollectionByIdAsync(next.variableCollectionId);
      val = nc ? next.valuesByMode[nc.defaultModeId || nc.modes[0].modeId] : null;
    }
    let resolvedHex = null;
    if (val && typeof val === 'object' && 'r' in val) {
      resolvedHex = '#' +
        Math.round(val.r * 255).toString(16).padStart(2, '0').toUpperCase() +
        Math.round(val.g * 255).toString(16).padStart(2, '0').toUpperCase() +
        Math.round(val.b * 255).toString(16).padStart(2, '0').toUpperCase();
    }
    return { variableId: varId, variableName: v.name, resolvedAlias: chain.join(' -> '), resolvedHex };
  } catch (e) {
    return { variableId: varId, variableName: null, resolvedAlias: null, resolvedHex: null };
  }
}

async function resolvedStylesFor(node) {
  const result = { fills: [], strokes: [], textColor: null };
  const paintProps = ['fills', 'strokes'];
  for (const propName of paintProps) {
    const paints = node[propName];
    if (!Array.isArray(paints)) continue;
    for (let i = 0; i < paints.length; i++) {
      const paint = paints[i];
      if (!paint || paint.visible === false) continue;
      const info = await paintTokenAlias(paint);
      const hex = info && info.resolvedHex ? info.resolvedHex : (paint.color ? '#' +
        Math.round(paint.color.r * 255).toString(16).padStart(2, '0').toUpperCase() +
        Math.round(paint.color.g * 255).toString(16).padStart(2, '0').toUpperCase() +
        Math.round(paint.color.b * 255).toString(16).padStart(2, '0').toUpperCase() : null);
      const entry = { hex, tokenAlias: info && info.variableName ? info.variableName : null, opacity: paint.opacity != null ? paint.opacity : 1 };
      if (propName === 'fills') result.fills.push(entry);
      else result.strokes.push(entry);
    }
  }
  // Text color comes from a child text node when the instance has a single primary text child.
  if (node.findOne) {
    const textNode = node.findOne ? node.findOne((n) => n.type === 'TEXT') : null;
    if (textNode && Array.isArray(textNode.fills) && textNode.fills[0]) {
      const info = await paintTokenAlias(textNode.fills[0]);
      const c = textNode.fills[0].color;
      result.textColor = {
        hex: info && info.resolvedHex ? info.resolvedHex : (c ? '#' +
          Math.round(c.r * 255).toString(16).padStart(2, '0').toUpperCase() +
          Math.round(c.g * 255).toString(16).padStart(2, '0').toUpperCase() +
          Math.round(c.b * 255).toString(16).padStart(2, '0').toUpperCase() : null),
        tokenAlias: info && info.variableName ? info.variableName : null,
      };
    }
  }
  return result;
}

async function instanceEntry(node, path) {
  const cp = node.componentProperties || {};
  const propertyOverrides = {};
  for (const key of Object.keys(cp)) {
    const prop = cp[key];
    let value = prop.value;
    if (prop.type === 'INSTANCE_SWAP' && prop.value) {
      try {
        const ref = await figma.getNodeByIdAsync(prop.value);
        if (ref) value = ref.name;
      } catch (e) { /* leave as raw id */ }
    }
    propertyOverrides[key.split('#')[0]] = value;
  }
  let mainComponentSetId = null;
  let variantOverrides = null;
  if (node.mainComponent) {
    const parent = node.mainComponent.parent;
    if (parent && parent.type === 'COMPONENT_SET') {
      mainComponentSetId = parent.id;
      variantOverrides = node.mainComponent.name;
    } else {
      // Standalone component (not part of a set).
      mainComponentSetId = node.mainComponent.id;
      variantOverrides = null;
    }
  }
  return {
    id: node.id,
    name: node.name,
    path: path.slice(),
    mainComponentSetId,
    variantOverrides,
    componentPropertyOverrides: propertyOverrides,
    resolvedStyles: await resolvedStylesFor(node),
  };
}

async function walkChildren(node, depth, path, instances, depthWarnings) {
  if (depth > MAX_DEPTH) {
    depthWarnings.push({ depthExceeded: true, atNodeId: node.id, atName: node.name });
    return;
  }
  if (!node || !Array.isArray(node.children)) return;
  for (const child of node.children) {
    const childPath = path.concat([child.name || child.id]);
    if (child.type === 'INSTANCE') {
      instances.push(await instanceEntry(child, childPath));
    }
    if (Array.isArray(child.children) && child.children.length > 0) {
      await walkChildren(child, depth + 1, childPath, instances, depthWarnings);
    }
  }
}

for (const id of ids) {
  try {
    const node = await figma.getNodeByIdAsync(id);
    if (!node) { out[id] = { error: 'not found' }; continue; }

    const enrichment = {
      source: 'plugin-api',
      capturedAt: new Date().toISOString(),
      componentProperties: null,
      mainComponent: null,
      boundVariables: [],
      componentInstances: [],
      depthWarnings: [],
    };

    if (node.type === 'INSTANCE') {
      const cp = node.componentProperties || {};
      enrichment.componentProperties = {};
      for (const key of Object.keys(cp)) {
        const prop = cp[key];
        let value = prop.value;
        if (prop.type === 'INSTANCE_SWAP' && prop.value) {
          try {
            const ref = await figma.getNodeByIdAsync(prop.value);
            if (ref) value = { id: prop.value, name: ref.name };
          } catch (e) { /* leave value as id */ }
        }
        enrichment.componentProperties[key.split('#')[0]] = value;
      }
      if (node.mainComponent) {
        enrichment.mainComponent = {
          id: node.mainComponent.id,
          name: node.mainComponent.name,
          parentSetName: node.mainComponent.parent ? node.mainComponent.parent.name : null,
        };
      }
    }

    const paintProps = ['fills', 'strokes', 'backgrounds'];
    for (const propName of paintProps) {
      const paints = node[propName];
      if (!Array.isArray(paints)) continue;
      for (let i = 0; i < paints.length; i++) {
        const paint = paints[i];
        if (!paint || paint.visible === false) continue;
        const info = await paintTokenAlias(paint);
        if (info) {
          enrichment.boundVariables.push({
            path: \\\`\\\${propName}[\\\${i}].color\\\`,
            ...info,
          });
        }
      }
    }

    // §1: walk the composite's tree, emit nested-instance entries.
    await walkChildren(node, 1, [], enrichment.componentInstances, enrichment.depthWarnings);

    out[id] = enrichment;
  } catch (e) {
    out[id] = { error: e && e.message ? e.message : String(e) };
  }
}

return out;
`;
```

Notes on the change:

- Adds `componentInstances` (array) and `depthWarnings` (array) fields to every `enrichment` object — empty arrays for nodes with no instance children or no depth issue.
- Adds `walkChildren()`, `instanceEntry()`, `resolvedStylesFor()` helpers. `instanceEntry` returns the exact shape the spec §1 specifies.
- Depth cap = 6, with explicit `depthWarnings` rather than silent truncation.
- Keeps the existing per-node `componentProperties`, `mainComponent`, and `boundVariables` shape unchanged — read-back tooling reading those fields continues to work.

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm run test --workspace=crew-cli -- --run enrichment-prompt`
Expected: PASS for all tests including the four new ones from Task 2.1.

- [ ] **Step 3: Run the full CLI test suite to catch regressions**

Run: `npm run test --workspace=crew-cli`
Expected: PASS for every test file. The other tests in `figma-snapshot/` (plugin-api-enrichment, emit, client) consume the prompt as an opaque string — no behavior they assert against should change.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck --workspace=crew-cli`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/figma-snapshot/enrichment-prompt.ts packages/cli/src/lib/figma-snapshot/enrichment-prompt.test.ts
git commit -m "feat(figma-snapshot): emit nested-instance overrides per composite

Plugin-API enrichment script now walks each composite's tree (depth
capped at 6) and emits a componentInstances entry per INSTANCE node:
id, name, path, mainComponentSetId, variantOverrides,
componentPropertyOverrides, resolvedStyles. depthWarnings surfaces
trees that exceed the cap rather than silently truncating.

Closes the data-shape side of the render-frame-anchor spec §1. The
visual-fidelity-check skill (subsequent commits) reads this data to
diff caller props against the actual variant Figma renders at each
call-site, not against the component set's general definitions."
```

---

## Phase 3: Skill content edits (§2–§5)

Three markdown files in the `.claude/skills/visual-fidelity-check/` location. All content sections — §2 Step 4 rewrite, §3 example rewrite, §4 anti-loophole, §5 pre-authoring, plus the chrome live-DOM Step 5 rewrite (Tasks 3.4–3.5, absorbed from CREW-146 PR B) — land in one phase. The skill path is already final, so this phase has no Phase 1 dependency.

### Task 3.1: Rewrite workflow Step 4 with new sub-flow + severity rules (§2)

**Files:**
- Modify: `.claude/skills/visual-fidelity-check/workflow.md` (around the existing Step 4 / "Caller check" section)

- [ ] **Step 1: Locate the existing Step 4 / Caller check section**

Run: `grep -n "Caller check\|Step 4" .claude/skills/visual-fidelity-check/workflow.md | head -10`

The current section walks "look at caller props → look up matching set variant → diff against variant's resolvedStyles." Replace that section's body with the new sub-flow.

- [ ] **Step 2: Replace the Caller check body**

In `.claude/skills/visual-fidelity-check/workflow.md`, replace the body of the "Caller check" / Step 4 section with this content:

```markdown
## Step 4 — Caller check (render-frame anchored)

For every caller in the touched-files diff, walk:

1. **Find the render composite.** Open `<caller>.figma.tsx` in the same directory (or the nearest `.figma.tsx` that references the caller). Resolve its `figma.connect(...)` URL to a `{fileKey, nodeId}`. The composite JSON lives at `<fixture-root>/snapshot/composites/<safe-id>.json` (where `safe-id` is nodeId with `:` replaced by `-`).

2. **Bail if the composite is missing.** If the file does not exist, surface as:
   > **HIGH (missing-data, blocking):** caller `<file>:<line>` references render frame `<nodeId>`; composite JSON `<path>` not in fixture. Run `crew figma-snapshot` (or scope-extend the existing run) to capture before proceeding.

   Do **not** fall back to diffing against the component set. Falling back is the regression this rule closes.

3. **Find the relevant nested instance.** Inside the composite's `enrichment.componentInstances` array, match against the caller by:
   1. **Label first.** If the caller renders a Pill labelled `"New Run"`, find the entry where `componentPropertyOverrides.Label === "New Run"`.
   2. **Path next.** If no Label match (or multiple matches), use the `path` breadcrumb to disambiguate by position in the composite tree.
   3. **Position last.** If neither resolves, fall back to "the Nth instance of this mainComponentSetId in the composite", matching to the Nth call site in the caller's JSX.

   If no match resolves, surface as:
   > **MEDIUM (verification-gap):** caller `<file>:<line>` renders `<Primitive>` but no matching instance found in composite `<nodeId>`. Manual disambiguation required.

4. **Diff caller props vs `entry.variantOverrides`.**
   - Any mismatch on a variant axis (`color`, `intensity`, `size`, `type`) → **HIGH (encoding error)**.
   - Example: caller has `<Button color="white" intensity="loud" size="xs">` but `entry.variantOverrides == "type=button-sm, color=idle, intensity=loud"`. Wrong variant entirely — the bug is in the code or the upstream spec, not in token deltas.

5. **Diff `entry.componentPropertyOverrides` vs caller's prop values.**
   - Icon name mismatch (caller passes `<Plus />`, override is `lucide/check`) → **HIGH (encoding error)**.
   - `Has Icon` mismatch (caller passes `icon` prop when override is `false`, or vice versa) → **MEDIUM**.
   - `Label` mismatch (caller's children text doesn't match override) → **LOW** (often expected — components accept text via children regardless).

6. **Diff `entry.resolvedStyles` vs the surface classes the caller's props would emit.**
   - Variant axes all match but `resolvedStyles` carries a fill/stroke override that the caller's surface classes don't reproduce (rare — instance-level style override on top of the variant) → **MEDIUM**.
   - Tag with hex + tokenAlias from `resolvedStyles` so the fix is unambiguous.

This sub-flow is mechanical. Follow it as a checklist — no judgment calls about "what counts as the right reference." The render composite is the right reference. Always.
```

- [ ] **Step 3: Add a severity-rules summary block at the end of Step 4**

Same file, immediately after the Step 4 body, add:

```markdown
### Step 4 severity rules (anti-loophole summary)

| Finding | Severity |
|---|---|
| Caller's variant axis prop ≠ `entry.variantOverrides` | **HIGH (encoding error)** |
| Render composite missing for a touched caller | **HIGH (missing-data, blocking)** |
| Icon name mismatch (`componentPropertyOverrides.Icon`) | **HIGH (encoding error)** |
| `Has Icon` mismatch | **MEDIUM** |
| Instance-level style override not reproduced by caller's classes | **MEDIUM** |
| Verification gap (no matching nested instance found) | **MEDIUM** |
| `Label` text mismatch | **LOW** (usually expected) |

**Never** diff against a component **set** variant when a render composite exists. If a finding's "Figma reference" line names `composites/272-120.json` (or any other set's JSON) instead of a render composite, the diff target is wrong — re-do Step 4 with the proper composite.
```

- [ ] **Step 4: Smoke-check the rewrite**

Read the section back end-to-end and confirm:
- The numbered sub-steps (1-6) form a complete walk from "caller diff line" to "severity classification."
- The severity table covers every sub-step's outcome.
- No reference to "set variant" as the primary diff target remains in Step 4.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/visual-fidelity-check/workflow.md
git commit -m "docs(skill): rewrite Step 4 with render-composite anchor

Step 4 now walks caller → .figma.tsx → render composite → nested
instance → variant overrides, and diffs props against the variant
Figma actually uses at the call-site (not the component set's
general definition). New HIGH-severity rules for encoding errors
(wrong variant chosen) and missing-data fixture gaps prevent the
'diff against the set' loophole that let PR #193's New Run
regression through.

Spec ref: docs/superpowers/specs/2026-05-13-visual-fidelity-render-frame-anchor.md §2"
```

### Task 3.2: Rewrite the findings-report example (§3)

**Files:**
- Modify: `.claude/skills/visual-fidelity-check/examples/findings-report-example.md`

- [ ] **Step 1: Replace Finding 4 with the New Run case**

Open `.claude/skills/visual-fidelity-check/examples/findings-report-example.md`. Locate Finding 4 (the existing `pillSurfaceClasses('white', 'loud')` vs Pill set diff). Replace the entire Finding 4 block with:

```markdown
### Finding 4: "New Run" button uses wrong Pill variant entirely

- **Kind:** caller (encoding error)
- **Severity:** HIGH
- **File:** `packages/dashboard/src/components/TopNav.tsx:53-60`
- **Code:**
  ```tsx
  <Button color="white" intensity="loud" size="xs" icon={<Plus />}>
    New Run
  </Button>
  ```
- **Render composite:** `composites/245-133.json` variant `"Active Tab=agents"`
  → `enrichment.componentInstances` entry where `componentPropertyOverrides.Label === "New Run"`:
  - `variantOverrides: "type=button-sm, color=idle, intensity=loud"`
  - `resolvedStyles.fills[0]: { hex: "#64748B", tokenAlias: "state/idle", opacity: 1 }`
  - `resolvedStyles.textColor: { hex: "#020617", tokenAlias: "state/foreground" }`
  - `resolvedStyles.strokes: []`
- **Diff:** code chose `white / loud / xs` (white CTA, h-6, 12px font, 12px icon).
  Figma renders `idle / loud / sm` (slate-500 CTA, h-8, 14px font, 16px icon).
  Three axes wrong: `color`, `size`, and the consequent geometry/typography.
- **Fix:**
  ```tsx
  <Button color="idle" intensity="loud" size="sm" icon={<Plus />}>
    New Run
  </Button>
  ```
  Drop any `font-semibold` className override — `font-medium` is the Button default and matches Figma's Hanken Grotesk Medium.
- **Why high-severity:** caller chose a variant Figma doesn't use at this call-site. Not a token delta — wrong variant entirely. Per SKILL.md "set vs composite" anti-loophole: never reach this conclusion by diffing against the Pill set's white-loud variant.
```

- [ ] **Step 2: Update Finding 1's reference breadcrumb**

In the same file, locate Finding 1 (state-badge `intensity="muted"` vs `mid`). Find the "Figma reference:" line — it currently points at the Pill set's `intensity=mid` general definition. Replace with a render-composite breadcrumb:

```diff
- **Figma reference:** snapshot node `1:756` (agent drawer screen) shows pill with visible 1px stroke in state color. Pill set's `intensity=muted` variant in `snapshot/composites/272-120.json` has `strokes: []`; `intensity=mid` adds `stroke: slate/500` (and equivalent per color).
+ **Figma reference:** `composites/212-910.json` (AgentRow) variant `"state=waiting"` → `enrichment.componentInstances` entry matching the state-badge slot: `variantOverrides: "type=pill, color=waiting, intensity=mid"`, `resolvedStyles.strokes: [{ hex: "#F59E0B", tokenAlias: "amber/500" }]`. The Pill set's `intensity=mid` general definition (in `composites/272-120.json`) is a secondary reference — the **AgentRow render composite** is what makes `intensity="mid"` the right call here.
```

- [ ] **Step 3: Run a smoke read to verify the file still hangs together**

Read the example front-to-back. Confirm:
- Findings are numbered consistently.
- Severity counts in the summary block match the actual findings shown.
- No remaining diff that diffs against a `272-120.json` (set) variant as the primary reference.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/visual-fidelity-check/examples/findings-report-example.md
git commit -m "docs(skill): rewrite Finding 4 example using New Run regression

The prior Finding 4 codified the wrong pattern (diffed
pillSurfaceClasses against the Pill set's white-loud variant).
Replace with the PR #193 New Run case as concrete material —
demonstrates the render-composite-vs-code diff and explicitly
notes why this reasoning style is HIGH severity.

Finding 1's Figma-reference breadcrumb also updated to point at
the AgentRow render composite as primary, with the Pill set
demoted to secondary reference."
```

### Task 3.3: Add SKILL.md anti-loophole + pre-authoring sections (§4 + §5)

**Files:**
- Modify: `.claude/skills/visual-fidelity-check/SKILL.md`

- [ ] **Step 1: Add the "set vs composite" anti-loophole paragraph**

In `SKILL.md`, locate the "Icon findings are NEVER judgment calls" anti-loophole paragraph (around line 62). Add a new sibling paragraph immediately after it:

```markdown
### The "set vs composite" rule

A component **set** (e.g., the Pill set at `272:120`) defines what variants are *possible*. A render **composite** (e.g., TopNav at `245:133`, AgentRow at `212:910`) shows what variant Figma *actually uses* at a specific call-site. **Never diff against a set variant when a render composite exists for the call-site.** If a caller's render composite is missing from the fixture, surface it as a fixture gap (HIGH, blocking) — do not silently fall back to set-only diffing. Set-only diffs are valid only when the caller has no render-composite reference (e.g., a primitives demonstration page or a standalone-component test fixture).

The mechanical version of this rule lives in `workflow.md` Step 4. The rule lives here at the why layer so workflow reorganizations can't accidentally undo the discipline.
```

- [ ] **Step 2: Add the pre-authoring section**

In `SKILL.md`, add a new top-level section before the `## Workflow` section. Reasonable placement: right after the skill's introductory paragraph(s) explaining what the skill does. The new section:

```markdown
## Before authoring specs that touch shared UI primitives

This skill exists because spec-encoding errors keep slipping into UI primitives (Pill, Input, Switch, Modal, etc.) — typically as "what variant does this caller use?" guesses made from set-variant reasoning. Catching them after the spec ships is expensive; preventing them at authoring time is cheap.

**Before writing a spec or plan that touches a shared UI primitive, do this:**

1. **Verify the fixture covers every caller in scope.** Open `<fixture-root>/snapshot/composites/` and confirm a render composite exists for each page/component the spec will modify. If any caller has no render composite, expand the snapshot (or scope-extend an existing run) before continuing.

2. **Read each composite's `componentInstances` array.** For the primitives you're going to touch, copy the `variantOverrides` and `componentPropertyOverrides` for each call-site. These are what the spec's caller→variant mapping must encode.

3. **Encode bottom-up from the renders, not top-down from the set.** Don't author "default → white-loud"-style mappings from "what's possible in the Pill set?" reasoning. That's how the same regression keeps slipping back in. Every caller→variant line in the spec must trace back to a specific composite + nested-instance entry.

This rule is asymmetric: skipping it at authoring time is what causes the gate to need to fire later. A spec author who follows this section produces specs the gate trivially passes.
```

- [ ] **Step 3: Read SKILL.md end-to-end to confirm flow**

The document should now read: intro → pre-authoring section (NEW) → anti-loopholes (icon + set-vs-composite, the latter NEW) → workflow. Confirm no contradictions, no orphan references.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/visual-fidelity-check/SKILL.md
git commit -m "docs(skill): add 'set vs composite' rule + pre-authoring section

Two new SKILL.md sections complete the render-frame-anchor spec:

- 'set vs composite' anti-loophole alongside the existing 'icon
  findings are NEVER judgment calls' rule. Sits at the why layer
  so workflow reorganizations can't undo it.
- 'Before authoring specs' section gives spec authors a concrete
  mechanical procedure for encoding caller→variant mappings from
  composite data, not from set reasoning. Asymmetric prevention:
  cheap at authoring time, expensive to catch downstream.

Spec ref: docs/superpowers/specs/2026-05-13-visual-fidelity-render-frame-anchor.md §4 §5"
```

### Task 3.4: Rewrite workflow Step 5 as live-DOM inspection (chrome integration)

> Absorbed from CREW-146 PR B (`docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md` Task 7) as part of the 2026-05-16 close-out. The chrome MCP wiring this depends on shipped in CREW-146 PR A (#225).

**Files:**
- Modify: `.claude/skills/visual-fidelity-check/workflow.md`

- [ ] **Step 1: Verify the chrome MCP tool id**

Confirm against CREW-146 PR A's merged code (`packages/cli/src/lib/mcp-config/`) what MCP tool id a dispatched agent sees: `writeMcpFile` keys the server as `chrome`, so the tool is `mcp__chrome__use_browser`. If the merged code keys it differently, use the actual id throughout the Step 5 content in Step 2. (In a plugin-loaded session the same server surfaces as `mcp__plugin_superpowers-chrome_chrome__use_browser` — do not copy that namespaced form.)

- [ ] **Step 2: Replace the Step 5 section**

In `.claude/skills/visual-fidelity-check/workflow.md`, replace the entire `## Step 5: Visual check (optional, requires dashboardUrl)` section (from that heading down to, but not including, `## Step 6: Compile findings report`) with:

```markdown
## Step 5: Live DOM check (required when `dashboardUrl` is set and chrome is wired)

Steps 3–4 read code and callers; neither reads the *rendered* DOM. Step 5 opens the running
dashboard via the chrome MCP server and inspects live elements — computed styles and rendered
SVG — against the Figma snapshot's `enrichment` data. This catches runtime-only failures the
static checks cannot: purged Tailwind classes, CSS specificity wars, theme overrides, and
icons where the source looks right but the rendered glyph is wrong.

**When this step runs:**

- `dashboardUrl` set **and** the `chrome` MCP server is wired (`mcp__chrome__use_browser`
  available) → Step 5 is **required**.
- `dashboardUrl` set but chrome is **not** wired (the `superpowers-chrome` plugin is not
  installed on this machine) → log a verification gap, skip 5.1–5.5, and record the gap in the
  report so the user can decide to install the plugin or accept partial coverage.
- `dashboardUrl` **not** set → skip Step 5 (consistent with Steps 1–4 behavior).

**Step 5.1 — Open the dashboard.** Call `mcp__chrome__use_browser` with `action: "navigate"`
to the resolved `dashboardUrl`. Wait for a known ready-state element (`await_element` on a
landing-page selector). If chrome is unreachable or navigate fails, log
`verification gap: chrome unreachable` and skip 5.2–5.5.

**Step 5.2 — Navigate to a screen exercising each touched component.** For each
`(component, variant)` the code can produce, identify the dashboard URL or in-app navigation
that surfaces an instance of that variant. Reuse the caller map from Step 4 to pick a screen.

**Step 5.3 — Color-property check.** For each touched `(component, variant)`:

1. Query the live element via CSS selector. **Selector identification is the agent's
   responsibility:** prefer `data-*` attributes if present, fall back to component-name class
   signatures, fall back to structural selectors as a last resort. If the project's components
   expose no stable selectors and you must use fragile structural ones, surface that as a
   verification-gap note in the report.
2. Use `mcp__chrome__use_browser` `action: "eval"` to read `getComputedStyle(el)`'s
   `backgroundColor`, `borderColor`, `color`. CDP returns these as `rgb(...)`.
3. Convert each to `#RRGGBB`.
4. Compare to `enrichment.boundVariables.resolvedHex` for the corresponding paint role from the
   Figma snapshot.
5. On mismatch: finding. Severity per the existing rules (large hex delta = high,
   near-identical = low). Cite both sides plus the live element's selector.

**Step 5.4 — Icon check.** For each touched component with an `Icon` INSTANCE_SWAP property in
Figma (`enrichment.componentProperties.Icon`):

1. Query the icon slot via selector.
2. Use `action: "eval"` to read `el.querySelector('svg, span')?.outerHTML` and
   `el.textContent`.
3. If it is an `<svg>`, read the lucide name (`data-lucide` / class signature / known marker)
   and compare to `enrichment.componentProperties.Icon.name`. Mismatch → finding, severity ≥
   medium.
4. If it is a `<span>` standing in for an icon, or a Unicode text node, → finding, severity ≥
   medium. Name the expected lucide glyph in the fix.

Step 5.4 is the runtime counterpart to Step 4's caller-side icon check — it catches cases
where the source looks right but the rendered DOM disagrees (className override, conditional
rendering, prop-forwarding bug).

**Step 5.5 — Screenshot cross-reference.** `use_browser` auto-captures a viewport PNG on every
action. Cite the most recent capture path in the report and cross-reference it with
`<snapshotPath>/screens/<screen-node>.png` from the Figma snapshot. If 5.1–5.4 already
surfaced findings, link the screenshot pair as supporting evidence rather than re-describing
it in prose.

**Failure mode:** if chrome is wired but the dashboard is unreachable (docker stack down, port
mismatch), Step 5 fails closed — log `verification gap: dashboard unreachable at <url>` and
surface it in the report. Do **not** treat dashboard-unreachable as "Step 5 passed."
```

- [ ] **Step 3: Verify the surrounding structure still reads correctly**

Confirm the section above `## Step 6: Compile findings report` flows correctly and that no `Step 5` reference elsewhere in `workflow.md` (Step 6's report template, Step 7) now contradicts the rewrite.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/visual-fidelity-check/workflow.md
git commit -m "feat(skill): rewrite visual-fidelity Step 5 as live-DOM inspection

Replaces the optional screenshot-diff step with a required five-substep
chrome-MCP inspection: computed-style color check and rendered-SVG icon
check against the Figma snapshot enrichment data."
```

### Task 3.5: Update SKILL.md for live-DOM Step 5 + browsing peer (chrome integration)

> Absorbed from CREW-146 PR B (`docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md` Task 8).

**Files:**
- Modify: `.claude/skills/visual-fidelity-check/SKILL.md`

- [ ] **Step 1: Update the workflow-overview line**

In the `## Workflow` numbered list, replace:

```markdown
6. **Visual check** (optional) — render + screenshot + compare to Figma screen
```

with:

```markdown
6. **Live DOM check** (required when `dashboardUrl` is set and chrome is wired) — open the dashboard via the chrome MCP, read computed styles + rendered SVG, compare to the Figma snapshot enrichment
```

- [ ] **Step 2: Add `browsing` to Related skills**

In the `## Related skills` section, add a bullet:

```markdown
- `browsing` — drives the running dashboard via Chrome DevTools Protocol (`mcp__chrome__use_browser`); required by Step 5's live-DOM inspection
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/visual-fidelity-check/SKILL.md
git commit -m "docs(skill): SKILL.md overview reflects live-DOM Step 5 + browsing peer"
```

### Task 3.6: Push Phase 3

- [ ] **Step 1: Push**

```bash
git push
```

Confirm CI passes.

---

## Phase 4: Migration + validation (§6 + §7)

Refresh the crew DS fixture with the new enrichment data, then verify the skill catches PR #193's regressions.

### Task 4.1: Refresh the crew DS fixture from the committed snapshot

> **RECONCILED 2026-05-18 (post-CREW-173).** CREW-173 made `.crew/figma-snapshot/` a
> **committed, git-tracked artifact** — `crew run` no longer generates it pre-dispatch. A
> `crew run CREW-152` worktree is a checkout of the repo, so the snapshot is already present,
> current, and enriched. This task copies that committed snapshot into the crew-135 fixture; it
> neither generates a snapshot nor needs `FIGMA_API_TOKEN`. See
> `docs/superpowers/specs/2026-05-17-figma-snapshot-committed-artifact-design.md`.

**Files:**
- Replace: contents of `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/composites/`

- [ ] **Step 1: Confirm the committed snapshot is present**

`.crew/figma-snapshot/` is committed to the repo (CREW-173), so the worktree already has it — there is no generation step.

Run: `ls .crew/figma-snapshot/composites/`
Expected: a list of `<id>.json` files. If the directory is missing or empty, surface as a blocker (it should never be, post-CREW-173). Do **not** run `crew figma-snapshot` yourself — it needs `FIGMA_API_TOKEN`, which a dispatched agent does not have; regenerating the snapshot is the interactive `figma-snapshot-refresh` skill's job, done before dispatch.

- [ ] **Step 2: Confirm the snapshot covers the Composites page**

crew's `[visual_fidelity]` config captures `figma_pages = ["Composites", "Dashboard Screens"]` from file `9FeJPriqdsdA4n9R5Xsrr8` (Composites page id `212:630`). The Composites-page nodes land under `.crew/figma-snapshot/composites/`.

Run: `ls .crew/figma-snapshot/composites/ | wc -l`
Expected: ≥ 10 JSON files — one per top-level child of the Composites page (AgentRow `212-910`, TopNav `245-133`, the Pill set `272-120`, the Modal / Form / Stepper composites, etc.). If far fewer, the snapshot's page coverage is wrong — surface as a blocker.

- [ ] **Step 3: Spot-verify the New Run instance**

Open `.crew/figma-snapshot/composites/245-133.json` (TopNav). Find the `enrichment.componentInstances` array. Locate the entry where `componentPropertyOverrides.Label == "New Run"`. Confirm:

```jsonc
{
  // ...
  "mainComponentSetId": "272:120",
  "variantOverrides": "type=button-sm, color=idle, intensity=loud",
  "componentPropertyOverrides": {
    "Has Icon": true,
    "Icon": "lucide/plus",
    "Label": "New Run"
  },
  "resolvedStyles": {
    "fills": [{ "hex": "#64748B", "tokenAlias": "state/idle", "opacity": 1 }],
    "strokes": [],
    "textColor": { "hex": "#020617", "tokenAlias": "state/foreground" }
  }
}
```

If any of these fields are missing or carry the wrong value, the enrichment script (Task 2.2) has a bug — surface it, do not proceed to Step 4.

- [ ] **Step 4: Spot-verify AgentRow per-state instances**

Open `.crew/figma-snapshot/composites/212-910.json` (AgentRow). The AgentRow Composite has 7 variants (`state=initializing` ... `state=finished`). Each variant should contain a Pill instance for the state badge. Pick the `state=waiting` variant and confirm its state-badge instance has:

```jsonc
{
  "variantOverrides": "type=pill, color=waiting, intensity=mid",
  "componentPropertyOverrides": {
    "Has Icon": true,
    "Icon": "lucide/circle",
    "Label": "Waiting"
  },
  "resolvedStyles": {
    "fills": [{ "tokenAlias": "amber-1050" }],   // hex may vary; tokenAlias is what matters
    "strokes": [{ "tokenAlias": "amber/500" }]
  }
}
```

If `Icon != "lucide/circle"` for every state's badge instance, that's load-bearing — every state should resolve to the same icon. Surface as a snapshot-data issue.

- [ ] **Step 5: Replace the fixture**

```bash
rm -rf docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/composites
cp -r .crew/figma-snapshot/composites docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/composites
```

The `snapshot/screens/` directory is unaffected. Use `cp`, not `mv` — `.crew/figma-snapshot/` is the live worktree snapshot; leave it intact.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/composites
git commit -m "fixture(crew-135): refresh composites with nested-instance enrichment

One-shot data refresh for the visual-fidelity-check fixture. Replaces
the sparse 2-composite snapshot (Pill set 272-120 + Clear attention
243-120) with the full Composites-page capture. Every render
composite now carries enrichment.componentInstances arrays so the
skill can diff caller props against the variant Figma actually uses
at each call-site.

Spec ref: docs/superpowers/specs/2026-05-13-visual-fidelity-render-frame-anchor.md §6"
```

### Task 4.2: Validate the gate against PR #193's regressions

**Files:** None modified — validation step only.

- [ ] **Step 1: Reconstruct PR #193's diff from the frozen patch**

> **RE-SCOPED 2026-05-16 (close-out).** PR #193 was closed and CREW-135 re-dispatched fresh, so its `CREW-135` branch no longer holds #193's commits. The diff was frozen at `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/pr-193.patch` before the re-dispatch.

```bash
git worktree add /tmp/crew-135-validation origin/main
git -C /tmp/crew-135-validation apply --3way \
  "$(git rev-parse --show-toplevel)/docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/pr-193.patch"
```

`--3way` reconstructs against the patch's recorded blob context; minor conflict markers from main drift are acceptable — the skill inspects the diff, it does not need a building tree. This gives a sibling worktree carrying PR #193's regressions.

- [ ] **Step 2: Copy the updated fixture + skill into the validation worktree**

Sync this branch's updated skill + fixture over the validation worktree's older copies:

```bash
cp -r .claude/skills/visual-fidelity-check /tmp/crew-135-validation/.claude/skills/
cp -r docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135 \
      /tmp/crew-135-validation/docs/superpowers/skill-fixtures/visual-fidelity-check/
```

- [ ] **Step 3: Invoke the skill against the validation worktree**

From a Claude Code session (or a `claude -p` invocation) operating against `/tmp/crew-135-validation`, invoke the `visual-fidelity-check` skill on the changed-files diff (`git diff` — the patch from Step 1 shows as unstaged changes in the validation worktree). The skill follows its own workflow; you don't need to drive it step-by-step.

Capture the findings report to a file:

```bash
# Inside the Claude session, the skill outputs a markdown report.
# Save it to /tmp/crew-135-validation-report.md.
```

- [ ] **Step 4: Verify the report catches the three known regressions**

Read `/tmp/crew-135-validation-report.md`. Confirm:

1. **HIGH-severity finding for `TopNav.tsx` New Run button.** The finding's "Render composite" line references `composites/245-133.json` (NOT `composites/272-120.json`). The diff names `variantOverrides: "type=button-sm, color=idle, intensity=loud"` as the render's variant and identifies `color="white" intensity="loud" size="xs"` in the code as the encoding error. Fix names `idle / loud / sm`.

2. **HIGH-severity finding(s) for `AgentRow.tsx` state-badge icons.** Either one finding listing all 7 states or 7 per-state findings. Each names the render composite (`composites/212-910.json`), names the per-state `Icon: "lucide/circle"`, and names the code's wrong choice (e.g., `<Loader2 />` for running, `<AlertCircle />` for waiting). Fix uniformly: every state passes `<Circle className="fill-current" />`, or Badge defaults the icon slot to that.

3. **HIGH-severity finding for the spurious `border` on `intensity="loud"`.** Names `lib/pill-variants.ts` (in the `case 'loud':` branch) as the source. Names the render composite for ANY `intensity=loud` instance (e.g. `composites/245-133.json` New Run) and confirms `resolvedStyles.strokes: []`.

If ANY of these three is missing, classified as low/medium, or attributed to the wrong file:

- **§1 (enrichment)** may not be capturing the right data — re-check the spot-verification in Task 4.1 Steps 3-4.
- **§2 (Step 4 sub-flow)** may not be triggering the right severity — re-check Task 3.1 Step 3.
- **§3 (example)** may not be a good enough teaching example — re-check Task 3.2.

Whatever surfaces is a spec input, not a "fix it inline" item — pause and surface to the user.

- [ ] **Step 5: Clean up the validation worktree**

```bash
git worktree remove /tmp/crew-135-validation
```

- [ ] **Step 6: Document validation outcome**

Append a one-paragraph "Validation run" section to the spec doc:

```bash
cat >> docs/superpowers/specs/2026-05-13-visual-fidelity-render-frame-anchor.md <<'EOF'

## Validation run (post-implementation)

Re-ran the visual-fidelity-check skill against PR #193's `CREW-135` branch using the refreshed fixture and updated workflow. All three known regressions surfaced at HIGH severity:

- New Run variant mismatch — diff target `composites/245-133.json`, code `white/loud/xs`, render `idle/loud/sm`.
- State-badge icons per state — diff target `composites/212-910.json`, render `lucide/circle` for every state; code variously `AlertCircle/Loader2/GitPullRequest/Check/AlertOctagon`.
- Spurious `border` on `intensity="loud"` — render composites show `resolvedStyles.strokes: []` on every loud instance; `lib/pill-variants.ts:case 'loud'` adds `border ${solidBorder}`.

No regressions slipped through. Re-dispatching CREW-135 against this combined fixture + skill is the next live verification.
EOF
```

- [ ] **Step 7: Commit the validation note**

```bash
git add docs/superpowers/specs/2026-05-13-visual-fidelity-render-frame-anchor.md
git commit -m "docs(spec): add post-implementation validation note

Validation run against PR #193's CREW-135 branch surfaced all three
known regressions at HIGH severity. Pipeline confirms the spec's
end-state: render-frame-anchored skill + enriched fixture catches
exactly the failure modes that slipped through prior attempts."
```

### Task 4.3: Push Phase 4

- [ ] **Step 1: Push**

```bash
git push
```

Confirm CI passes.

---

## Self-review

### Spec coverage

| Spec section | Task(s) |
|---|---|
| §1 Fixture enrichment | Task 2.1 (failing tests), Task 2.2 (implementation) |
| §2 Skill Step 4 + severity rules | Task 3.1 |
| §3 Example rewrite | Task 3.2 |
| §4 Anti-loophole rule | Task 3.3 |
| §5 Pre-authoring rule | Task 3.3 |
| §6 Migration | Task 4.1 |
| §7 Validation | Task 4.2 |
| §8 Placement + injection-module deletion | Tasks 1.1, 1.2, 1.3, 1.4, 1.5 |

No spec section without a task. No task without a spec anchor.

### Placeholder scan

- No "TBD", "TODO", "implement later", or "add appropriate handling" entries.
- Every code-change task carries the complete code (enrichment script body, exact diff hunks for run.ts, etc.).
- Exact commands with expected output for every test / typecheck / verification step.
- Task 4.1 Step 1 has a fallback ("if unclear, surface as a blocker — don't guess") rather than a placeholder; the surrounding text describes how to discover the entry point.

### Type / name consistency

- `componentInstances`, `mainComponentSetId`, `variantOverrides`, `componentPropertyOverrides`, `resolvedStyles`, `path`, `depthWarnings` — used identically in §1 (enrichment script), Task 2.1 (tests), Task 3.1 (workflow), Task 3.2 (example), Task 4.1 (spot-verification).
- `Has Icon`, `Icon`, `Label` — property names match across enrichment script (line `key.split('#')[0]`), workflow rules, example, and spot-verification.
- `composites/<safe-id>.json` filename pattern — used identically in workflow Step 4 and Task 4.1.
- The `crew-135` fixture name persists through Tasks 4.1 and 4.2.

No inconsistencies surfaced.

---

## Execution handoff

Per the user's CLAUDE.md planning workflow: after this plan exists, the next steps are (a) create a Jira Epic + child tickets reflecting the four phases, (b) link dependencies (P3 blocked by P1; P4 blocked by P2 + P3), (c) lay out the parallel-vs-sequential schedule for the user to confirm, then (d) STOP and wait for the user to trigger `crew run`. Implementation execution is user-triggered.
