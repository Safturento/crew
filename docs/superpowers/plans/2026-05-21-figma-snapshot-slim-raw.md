# `figma-snapshot` slim `raw` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the recursive `children` subtree from per-node JSON's `raw` field so committed snapshots fit under tool-read limits; regenerate this repo's snapshot to land the size reduction in the PR.

**Architecture:** Two-call-site change in `emit.ts`: `raw: t.node` becomes `raw: { ...t.node, children: undefined }`. `JSON.stringify` drops `undefined` keys so the serialized payload omits `children` while every other top-level Figma property survives. Skill docs get a one-paragraph clarification of the data tier. Implementing PR runs a full `crew figma-snapshot` + the figma-snapshot-refresh skill's enrichment step to regenerate this repo's snapshot.

**Tech Stack:** Node + TypeScript. Vitest for tests. Existing `crew figma-snapshot` CLI + `figma-snapshot-refresh` skill for regeneration.

**Inputs:**
- Spec: `docs/superpowers/specs/2026-05-21-figma-snapshot-slim-raw-design.md`
- Followup: 2026-05-12 entry in `docs/followups.md` (augmented 2026-05-19)

---

## File structure

| File | Action | Responsibility after change |
|---|---|---|
| `packages/cli/src/lib/figma-snapshot/emit.ts` | Modify (two `raw:` field writes) | Per-node JSON's `raw` carries top-level properties only |
| `packages/cli/src/lib/figma-snapshot/emit.test.ts` | Modify (two new assertions on existing tests) | Locks the no-children contract + a positive top-level field |
| `.claude/skills/visual-fidelity-check/workflow.md` | Modify (Step 4 prose) | Documents `raw` as top-level only; nested data via `enrichment.componentInstances` |
| `.claude/skills/visual-fidelity-check/SKILL.md` | Modify (data-tiers paragraph) | Same clarification |
| `.crew/figma-snapshot/composites/*.json` + `screens/*.json` | Regenerate via crew CLI + figma-snapshot-refresh skill | Existing snapshot adopts the slim shape |
| `docs/followups.md` | Modify (move 2026-05-12 entry to Resolved) | Reflect shipped state |

No new files. No new packages.

---

## Task 1 — Slim `raw` in `emit.ts` (both export paths)

**Files:**
- Modify: `packages/cli/src/lib/figma-snapshot/emit.ts`
- Test: `packages/cli/src/lib/figma-snapshot/emit.test.ts`

Both `emitSnapshot` (full export) and `emitPartialSnapshot` (selective export added in #248) currently write `raw: <node>` directly. Change both to spread the node with `children: undefined`. `JSON.stringify` drops `undefined` values so the serialized JSON omits `children` cleanly.

- [ ] **Step 1: Update the existing test to lock the no-children contract**

In `packages/cli/src/lib/figma-snapshot/emit.test.ts`, find the existing
assertion in the happy-path test (around line 110-118):

```ts
    // Per-component JSON includes id/name/type/page + raw node.
    const componentJson = JSON.parse(readFileSync(join(outDir, 'composites/272-120.json'), 'utf8'));
    expect(componentJson).toMatchObject({
      id: '272:120',
      name: 'Pill',
      type: 'COMPONENT_SET',
      page: 'Composites',
    });
    expect(componentJson.raw.id).toBe('272:120');
```

Add two assertions immediately after the existing `raw.id` check:

```ts
    expect(componentJson.raw.id).toBe('272:120');
    // raw is a top-level projection — children is dropped to keep the file
    // under tool-read limits. Nested data lives in enrichment.componentInstances.
    expect(componentJson.raw.children).toBeUndefined();
    expect(componentJson.raw.type).toBe('COMPONENT_SET');
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npm run test:run --workspace=crew-cli -- emit.test
```

Expected: FAIL — `componentJson.raw.children` is currently an array (`[]` in
the fixture), not `undefined`.

- [ ] **Step 3: Update `emit.ts` — slim raw on both export paths**

In `packages/cli/src/lib/figma-snapshot/emit.ts`, find the `emitSnapshot`
function's per-node-JSON write (around line 95-102):

```ts
    await writeFile(
      join(opts.outDir, jsonPath),
      `${JSON.stringify(
        { id: t.node.id, name: t.node.name, type: t.node.type, page: t.page, raw: t.node },
        null,
        2,
      )}\n`,
    );
```

Change `raw: t.node` to `raw: { ...t.node, children: undefined }`:

```ts
    await writeFile(
      join(opts.outDir, jsonPath),
      `${JSON.stringify(
        {
          id: t.node.id,
          name: t.node.name,
          type: t.node.type,
          page: t.page,
          // Slim `raw` to top-level properties only — `children` is dropped to
          // keep the file under tool-read limits. Nested instance data lives
          // in `enrichment.componentInstances`. JSON.stringify omits the
          // undefined key cleanly.
          raw: { ...t.node, children: undefined },
        },
        null,
        2,
      )}\n`,
    );
```

Find the same shape inside `emitPartialSnapshot` (the partial-export path
from #248, around line 180-188):

```ts
    pendingWrites.push({
      absPath: join(opts.outDir, jsonPath),
      contents: `${JSON.stringify(
        { id: node.id, name: node.name, type: node.type, page: t.page, raw: node },
        null,
        2,
      )}\n`,
      dir: t.dir,
    });
```

Change `raw: node` to `raw: { ...node, children: undefined }`:

```ts
    pendingWrites.push({
      absPath: join(opts.outDir, jsonPath),
      contents: `${JSON.stringify(
        {
          id: node.id,
          name: node.name,
          type: node.type,
          page: t.page,
          raw: { ...node, children: undefined },
        },
        null,
        2,
      )}\n`,
      dir: t.dir,
    });
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
npm run test:run --workspace=crew-cli -- emit.test
```

Expected: PASS — all existing tests still green, plus the two new assertions
pass. Note in particular: the partial-emit tests (the seedSnapshot fixture
sets `raw: { id, name, type, children: [] }` in the pre-seeded per-node
JSON) keep working because they assert on `name`/`type` fields, not on
`raw.children`.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck --workspace=crew-cli
```

Expected: clean. The spread + `undefined` override is valid TypeScript
against the `FigmaNode` interface (`children?: FigmaNode[]`).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/figma-snapshot/emit.ts \
        packages/cli/src/lib/figma-snapshot/emit.test.ts
git commit -m "fix(figma-snapshot): drop recursive children from raw projection"
```

---

## Task 2 — Skill doc clarification

**Files:**
- Modify: `.claude/skills/visual-fidelity-check/workflow.md`
- Modify: `.claude/skills/visual-fidelity-check/SKILL.md`

The skill prose says "use `raw` for canonical structure" without specifying
which fields. With Task 1's change, `raw` is explicitly top-level only.
Clarify the prose so future agents don't expect to walk `raw.children`.

- [ ] **Step 1: Update `workflow.md` Step 4**

In `.claude/skills/visual-fidelity-check/workflow.md` find the lines that describe `raw` (around line 38-44):

```markdown
   - **`raw`** (always present) — full REST API node tree. Use for canonical structure, names, geometry, basic fills/strokes hex values.
```

Replace with:

```markdown
   - **`raw`** (always present) — top-level REST API properties only (fills, strokes, absoluteBoundingBox, layoutMode, paddings, cornerRadius, effects, etc.). The recursive `children` subtree is deliberately omitted — nested instance data lives in `enrichment.componentInstances`. Use `raw` for top-level paint hex values, geometry, and layout when `enrichment` is missing.
```

- [ ] **Step 2: Update `SKILL.md` data-tiers paragraph**

In `.claude/skills/visual-fidelity-check/SKILL.md` find the paragraph that introduces the two tiers (around line 68):

```markdown
Each per-node JSON in `<snapshotPath>` has two data tiers: `raw` (REST API, always present) and `enrichment` (Plugin-API, present when snapshot was enriched successfully). **Always prefer `enrichment`** when available:
```

Replace with:

```markdown
Each per-node JSON in `<snapshotPath>` has two data tiers: `raw` (REST API top-level node properties — no `children`; always present) and `enrichment` (Plugin-API, present when snapshot was enriched successfully). **Always prefer `enrichment`** when available:
```

- [ ] **Step 3: Verify the prose still makes sense**

```bash
grep -n 'raw' .claude/skills/visual-fidelity-check/SKILL.md \
              .claude/skills/visual-fidelity-check/workflow.md
```

Expected: every `raw` reference now either (a) names a top-level field
(`raw.fills`, `raw.strokes`, etc.) or (b) clarifies that `raw` is
top-level-only. No reference implies `raw.children` is available.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/visual-fidelity-check/SKILL.md \
        .claude/skills/visual-fidelity-check/workflow.md
git commit -m "docs(skill): clarify visual-fidelity-check raw is top-level only"
```

---

## Task 3 — Regenerate this repo's snapshot

**Files:**
- Modify (regenerate): `.crew/figma-snapshot/composites/*.json` + `screens/*.json` + `index.json` + `meta.json` + every `*.png`

Run the full export against the live Crew Figma file to land the slim-`raw`
shape in this repo's committed snapshot. The PR diff carries the size
reduction as visible evidence.

- [ ] **Step 1: Run the full export**

```bash
crew figma-snapshot
```

Expected: prints `exporting pages Composites, Dashboard Screens → <path>` and
ends with `✓ figma-snapshot complete (N nodes)`. The command rewrites every
per-node JSON in `.crew/figma-snapshot/composites/` and
`.crew/figma-snapshot/screens/`, plus `index.json` and `meta.json`.

- [ ] **Step 2: Sanity-check the size drop**

```bash
wc -c .crew/figma-snapshot/composites/212-910.json
```

Expected: well under 256 KB (the Read tool's hard limit). The AgentRow
composite specifically should drop from 632 KB to under 10 KB.

```bash
ls -lh .crew/figma-snapshot/composites/*.json | head -20
```

Expected: every JSON in `composites/` is single-digit KB.

- [ ] **Step 3: Enrich via the figma-snapshot-refresh skill**

The committed snapshot is fail-closed on `enrichment` — without it,
`visual-fidelity-check` can't run. Follow the
`figma-snapshot-refresh` skill's procedure from step 3p forward (this is
not a `--node-id` partial; it's a full refresh after a fresh REST export):

1. Invoke the `figma-use` skill (mandatory prereq for any `use_figma` call).
2. Read the node IDs from `.crew/figma-snapshot/index.json` (the keys).
3. Run a sizing probe through `use_figma` with `enrichment-script.js` and the line
   `out[id] = JSON.stringify(enrichment).length;` to size batches under ~20 KB.
4. Run `use_figma` once per batch with `enrichment-script.js` (the full script;
   `<NODE_IDS_JSON>` substituted with the batch's node IDs).
5. After each batch returns, merge each `nodeId → enrichment` entry into its
   per-node JSON file as a top-level `enrichment` field. Do NOT modify the
   `raw` field (this is critical — the slimmed `raw` from Step 1 is what we
   want to commit).

- [ ] **Step 4: Verify every per-node JSON has `enrichment.componentInstances`**

```bash
for f in .crew/figma-snapshot/composites/*.json .crew/figma-snapshot/screens/*.json; do
  node -e "
    const d = JSON.parse(require('fs').readFileSync('$f', 'utf8'));
    if (!d.enrichment || !Array.isArray(d.enrichment.componentInstances)) {
      console.error('MISSING:', '$f');
      process.exit(1);
    }
  " || break
done
echo 'all enriched'
```

Expected: prints `all enriched`. If anything errors, STOP — go back to
Task 3 Step 3 and finish the missing enrichments.

- [ ] **Step 5: Verify `--check` reports fresh**

```bash
crew figma-snapshot --check
```

Expected: `✓ snapshot is fresh (Figma version <hash>)`. Exit code 0.

- [ ] **Step 6: Commit the regenerated snapshot**

```bash
git add .crew/figma-snapshot/
git commit -m "chore(figma-snapshot): regenerate snapshot with slim raw"
```

The diff size on this commit is expected to be large in terms of line
count but reflect a ~95% reduction in per-file size — the new format
strips the recursive `children` subtree across every composite and screen.

---

## Task 4 — Resolve the 2026-05-12 followup

**Files:**
- Modify: `docs/followups.md`

The 2026-05-12 entry "Cap or filter `raw` subtree size in figma-snapshot
per-component JSON" (augmented 2026-05-19) moves to Resolved.

- [ ] **Step 1: Move the entry from `## Active` to `## Resolved`**

In `docs/followups.md`:

1. Locate the `### 2026-05-12 — Cap or filter \`raw\` subtree size in figma-snapshot per-component JSON` heading and its full body (ends at the next `###` heading).
2. Cut the entry.
3. Paste into `## Resolved`, just under the section heading at the top of that block.
4. Append a `**Resolved 2026-05-21:**` line:

```markdown
**Resolved 2026-05-21:** Shipped top-level-only projection in `emit.ts` — `raw` field now spreads the Figma node with `children: undefined`, which `JSON.stringify` omits cleanly. AgentRow composite JSON dropped from 632 KB to under 10 KB; all snapshot JSONs now fit under the Read tool's 256 KB limit. Skill prose in `.claude/skills/visual-fidelity-check/` clarified to match. Spec: `docs/superpowers/specs/2026-05-21-figma-snapshot-slim-raw-design.md`; plan: `docs/superpowers/plans/2026-05-21-figma-snapshot-slim-raw.md`.
```

- [ ] **Step 2: Update the ToC**

In the `## Contents` section, move the `2026-05-12 — Cap or filter raw…`
bullet from the `Active` sublist to the `Resolved` sublist. Anchor slug
unchanged (heading text is unchanged).

- [ ] **Step 3: Spot-check**

```bash
grep -n '2026-05-12 — Cap or filter' docs/followups.md
```

Expected: exactly two lines (ToC + heading), both now inside the Resolved
section.

- [ ] **Step 4: Commit**

```bash
git add docs/followups.md
git commit -m "docs(followups): resolve 2026-05-12 raw-subtree size entry"
```

---

## Task 5 — Verification + PR

**Files:** none (verification only)

- [ ] **Step 1: Full crew-cli + crew-daemon test suite**

```bash
npm run test:run --workspace=crew-cli
npm run test:run --workspace=crew-daemon
```

Expected: both green.

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```

Expected: clean.

- [ ] **Step 3: Push + open the PR**

```bash
git push -u origin fix/figma-snapshot-slim-raw
gh pr create --title "fix(figma-snapshot): drop recursive children from raw projection" --body "$(cat <<'EOF'
## Summary

- `emit.ts` writes `raw: { ...node, children: undefined }` on both export paths (`emitSnapshot` + `emitPartialSnapshot`). `JSON.stringify` omits `undefined` keys, so the serialized payload drops the recursive `children` subtree while every other top-level Figma property survives.
- `visual-fidelity-check` skill prose (workflow.md + SKILL.md) clarified to match — `raw` is top-level only; nested data lives in `enrichment.componentInstances`. The fallback contract is unchanged.
- `.crew/figma-snapshot/` regenerated to land the slim shape in this repo. AgentRow composite JSON drops from 632 KB to under 10 KB; the file now fits under the Read tool's 256 KB limit so agents can ingest it directly instead of falling back to grep.
- 2026-05-12 followup entry moved to Resolved.

## Why this isn't a regression

- Normal flow: snapshot is enriched (fail-closed). Consumer reads `enrichment.*` fields exclusively; `raw` is untouched.
- Fallback flow (enrichment absent): consumer reads `raw.fills` / `raw.strokes` / `raw.absoluteBoundingBox`. All still present.
- Nothing reads `raw.children`. Confirmed via grep across `packages/`, `.claude/skills/`, `scripts/`.

## Test plan

- [x] `npm run test:run --workspace=crew-cli` — full suite green incl. new emit.test.ts assertions
- [x] `npm run typecheck` — clean
- [x] `npm run lint` — clean
- [x] `wc -c .crew/figma-snapshot/composites/212-910.json` — under 10 KB (was 632 KB)
- [x] `crew figma-snapshot --check` — fresh
- [x] Manual: spot-check one per-node JSON has `raw.fills`, `raw.strokes`, `raw.absoluteBoundingBox` and no `raw.children`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Surface to the user.

---

## Self-review

Spec coverage:

| Spec section | Implementing task |
|---|---|
| `emit.ts` projection on both export paths | Task 1 |
| `emit.test.ts` no-children + positive-field assertions | Task 1 Step 1 |
| Skill doc clarification | Task 2 |
| Snapshot regeneration in implementing PR | Task 3 |
| Followup resolution | Task 4 |
| Verification gates | Task 5 |

No placeholders — every step shows the actual code or command. Type
consistency: the `FigmaNode` type's `children?` is optional, so
`{ ...node, children: undefined }` is sound TypeScript with no cast.
