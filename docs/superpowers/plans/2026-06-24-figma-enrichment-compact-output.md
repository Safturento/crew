# Compact `figma-snapshot` Enrichment Output — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this is an **interactive** skill-file change — execute it live in-session (skill files under `.claude/skills/` can't be written by `crew run` dispatch, and validation drives the Figma MCP `use_figma`, which only works interactively). Steps use checkbox (`- [ ]`) syntax for tracking. Invoke `figma-use` before any `use_figma` call.

**Goal:** Reshape the enrichment payload emitted by `enrichment-script.js` to drop null/empty/unread fields so no single snapshot node's enrichment approaches the `use_figma` ~20 KB cap and batches pack denser — without breaking the `visual-fidelity-check` consumer or `mergeEnrichment`.

**Architecture:** Change only the producer (`enrichment-script.js`). Build each instance entry and the top-level object with conditional field assignment (assign only when non-null/non-empty), and drop the per-instance `path`. Keep `source` and `componentInstances` always (so `mergeEnrichment` validation passes). Consumers null-check, so absent ≡ empty — no flag-day, no CLI/test change. Validate empirically via the sizing probe + one live round-trip.

**Tech Stack:** Figma Plugin API JS (`use_figma`), the `crew figma-snapshot --enrich` CLI (already shipped, CREW-281), markdown skill docs.

## Global Constraints

- **Skill-only, interactive.** Edits land under `.claude/skills/`; author via interactive Write, branch `CREW-283`, PR like CREW-282. No `crew run`.
- **Keep `source: 'plugin-api'` and `componentInstances` (array, even if `[]`) on every entry** — `mergeEnrichment` (`packages/cli/src/lib/figma-snapshot/merge.ts`) rejects an entry without them.
- **Omit, don't null.** A field that would be null/empty is left out entirely. Key names are otherwise unchanged (no key-shortening).
- **Drop per-instance `path` entirely** — the consumer never reads it.
- **No CLI code or test changes.** `mergeEnrichment` and its fixtures stay valid by construction.
- **Cap target:** after compaction every node's enrichment JSON should be **< ~15 KB** (leaving batch headroom under the ~20 KB `use_figma` response cap).

---

### Task 1: Emit compact enrichment from `enrichment-script.js`

**Files:**
- Modify: `.claude/skills/figma-snapshot-refresh/enrichment-script.js`

**Interfaces:**
- Consumes: nothing new (same Figma Plugin API).
- Produces: the same `{ nodeId: enrichmentObject }` return shape, but each `enrichmentObject` and each `componentInstances[]` entry omits null/empty fields and drops `path`. `source` + `componentInstances` always present.

- [ ] **Step 1: Rewrite `instanceEntry` to build a compact entry (drop `path`, omit empties)**

Replace the `instanceEntry` function's `return { … }` so it conditionally assigns fields:

```js
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
      mainComponentSetId = node.mainComponent.id;
    }
  }
  // Compact: drop `path` (consumer never reads it); omit null/empty fields.
  const entry = { id: node.id, name: node.name, mainComponentSetId };
  if (variantOverrides !== null) entry.variantOverrides = variantOverrides;
  if (Object.keys(propertyOverrides).length > 0) entry.componentPropertyOverrides = propertyOverrides;
  const styles = await resolvedStylesFor(node);
  const rs = {};
  if (styles.fills.length > 0) rs.fills = styles.fills;
  if (styles.strokes.length > 0) rs.strokes = styles.strokes;
  if (styles.textColor) rs.textColor = styles.textColor;
  if (Object.keys(rs).length > 0) entry.resolvedStyles = rs;
  return entry;
}
```

(The `path` parameter stays in the signature — `walkChildren` still passes `childPath` — it is simply no longer stored.)

- [ ] **Step 2: Rewrite the per-node loop to build a compact top-level object**

In the `for (const id of ids)` loop, replace the eager `enrichment = { …all fields… }` construction with conditional assignment:

```js
for (const id of ids) {
  try {
    const node = await figma.getNodeByIdAsync(id);
    if (!node) { out[id] = { error: 'not found' }; continue; }

    // Compact: always keep `source` + `componentInstances`; add the rest only when non-empty.
    const enrichment = {
      source: 'plugin-api',
      capturedAt: new Date().toISOString(),
      componentInstances: [],
    };
    const depthWarnings = [];

    if (node.type === 'INSTANCE') {
      const cp = node.componentProperties || {};
      const componentProperties = {};
      for (const key of Object.keys(cp)) {
        const prop = cp[key];
        let value = prop.value;
        if (prop.type === 'INSTANCE_SWAP' && prop.value) {
          try {
            const ref = await figma.getNodeByIdAsync(prop.value);
            if (ref) value = { id: prop.value, name: ref.name };
          } catch (e) { /* leave value as id */ }
        }
        componentProperties[key.split('#')[0]] = value;
      }
      if (Object.keys(componentProperties).length > 0) enrichment.componentProperties = componentProperties;
      if (node.mainComponent) {
        enrichment.mainComponent = {
          id: node.mainComponent.id,
          name: node.mainComponent.name,
          parentSetName: node.mainComponent.parent ? node.mainComponent.parent.name : null,
        };
      }
    }

    const boundVariables = [];
    const paintProps = ['fills', 'strokes', 'backgrounds'];
    for (const propName of paintProps) {
      const paints = node[propName];
      if (!Array.isArray(paints)) continue;
      for (let i = 0; i < paints.length; i++) {
        const paint = paints[i];
        if (!paint || paint.visible === false) continue;
        const info = await paintTokenAlias(paint);
        if (info) boundVariables.push({ path: `${propName}[${i}].color`, ...info });
      }
    }
    if (boundVariables.length > 0) enrichment.boundVariables = boundVariables;

    await walkChildren(node, 1, [], enrichment.componentInstances, depthWarnings);
    if (depthWarnings.length > 0) enrichment.depthWarnings = depthWarnings;

    out[id] = enrichment;
  } catch (e) {
    out[id] = { error: e && e.message ? e.message : String(e) };
  }
}
```

Note: `boundVariables` keeps its own `path` field (a property-path string like `fills[0].color`, distinct from the dropped per-instance `path` array) — the consumer reads `boundVariables`, so leave it intact.

- [ ] **Step 3: Header comment — document the compact shape**

Update the top-of-file comment block to state the script returns a **compact** object: `source` + `componentInstances` always present; all other top-level fields and per-instance fields omitted when null/empty; per-instance `path` not emitted.

- [ ] **Step 4: Validate — sizing probe (the RED→GREEN check)**

Invoke `figma-use`, then run the **sizing-probe variant** of the edited script (final line `out[id] = JSON.stringify(enrichment).length;`) over all snapshot node IDs (the keys of `.crew/figma-snapshot/index.json`), `fileKey: 9FeJPriqdsdA4n9R5Xsrr8`.

Expected: every value comfortably under the cap; **`665:864` drops from 20,329 to roughly ~11–13 KB** and no node exceeds ~15 KB. If any node is still ≥ ~18 KB, STOP — compaction was insufficient and chunking (out of scope) needs reconsidering; surface it.

- [ ] **Step 5: Validate — one live round-trip**

Run the compact enrichment script for a single representative node (use `665:864`, the worst case), `fileKey: 9FeJPriqdsdA4n9R5Xsrr8`. Write the returned `{ "665:864": {…} }` verbatim to a temp file under `$TMPDIR`. Then, from the repo root:

```bash
NODE_USE_ENV_PROXY=1 node --import tsx packages/cli/src/index.ts figma-snapshot --node-id 665:864
NODE_USE_ENV_PROXY=1 node --import tsx packages/cli/src/index.ts figma-snapshot --enrich <tempfile>
```

Expected: `✓ figma-snapshot enrichment merged (1 node(s))`, exit 0. Then verify the per-node file:

```bash
node -e "const j=require('./.crew/figma-snapshot/composites/665-864.json'); const e=j.enrichment; console.log('source:',e.source,'| instances:',e.componentInstances.length,'| has path on instance0:', 'path' in e.componentInstances[0], '| raw intact:', !!j.raw);"
```

Expected: `source: plugin-api | instances: 55 | has path on instance0: false | raw intact: true`.

(`665:864`'s `metadataPath` is on the `Composites` page; confirm the exact path from `index.json` if the page differs.)

- [ ] **Step 6: Revert the validation snapshot churn**

This ticket is skill-only; do not commit snapshot changes here. Restore the committed snapshot:

```bash
git checkout .crew/figma-snapshot/
```

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/figma-snapshot-refresh/enrichment-script.js
git commit -m "feat(skill): compact figma-snapshot enrichment output (CREW-283)"
```

---

### Task 2: Update `figma-snapshot-refresh` SKILL.md

**Files:**
- Modify: `.claude/skills/figma-snapshot-refresh/SKILL.md`

- [ ] **Step 1: Note the compact output in step 4**

In step 4 (Enrich), add one sentence after the script description: the script returns a **compact** object (null/empty fields and per-instance `path` omitted), so batches pack denser than the legacy "≈5–8 nodes" rule of thumb — size with the probe.

- [ ] **Step 2: Add the "single node still near cap" signal**

Add a red-flags row (or a note under step 4's batching guidance): if the sizing probe shows a **single node** near/over the ~20 KB cap even after compaction, do not try to batch it — that is the signal that per-node chunking (currently unbuilt) is needed; stop and surface it rather than committing a truncated enrichment.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/figma-snapshot-refresh/SKILL.md
git commit -m "docs(skill): note compact enrichment output + oversized-node signal (CREW-283)"
```

---

### Task 3: Refresh `visual-fidelity-check` doc examples

**Files:**
- Modify: `.claude/skills/visual-fidelity-check/workflow.md`
- Modify: `.claude/skills/visual-fidelity-check/examples/findings-report-example.md`

- [ ] **Step 1: Update illustrative enrichment snippets**

Where these docs show an example `enrichment` / `componentInstances` entry, remove fields the compact shape now omits (a `path` array, `fills: []`/`strokes: []`/`textColor: null`, top-level `componentProperties: null` etc.) so the documented shape matches what lands on disk. Do **not** change the prose describing which fields the check reads (`mainComponentSetId`, `variantOverrides`, `componentPropertyOverrides`, `resolvedStyles`, `tokenAlias`, `boundVariables`) — those are unchanged. If a snippet shows no omittable fields, leave it.

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/visual-fidelity-check/
git commit -m "docs(skill): align visual-fidelity-check examples with compact enrichment (CREW-283)"
```

---

### Task 4: Doc parity + finish

- [ ] **Step 1: Run `agents-doc-parity-check`**

`.agents/dispatch.md` declares `covers: .claude/skills/**`. Run the check against the changed skill paths. `dispatch.md` describes enrichment at the flow level (REST + Plugin-API enrichment, the `--enrich` merge), not the field-level shape, so it likely needs no change — but verify and update if it does.

- [ ] **Step 2: Push + PR**

Branch `CREW-283`, PR against `main`. Body: the compaction rules, the before/after size for `665:864`, and the live round-trip evidence. Mark it interactive.

## Self-Review

- **Spec coverage:** compaction rules → Task 1 steps 1–2 (table mapped field-by-field); `source`/`componentInstances` retained → Task 1 step 2; drop `path` → Task 1 step 1; SKILL.md note + chunking signal → Task 2; consumer doc refresh → Task 3; backward-compat (omit-not-null) → inherent in conditional assignment; verification (probe + round-trip + spot-check) → Task 1 steps 4–5; doc parity → Task 4; out-of-scope (no CLI/test change) → respected (no such tasks). All covered.
- **Placeholder scan:** none — `CREW-283` is a deliberate fill-in at ticket-creation, not a content gap; all code shown in full.
- **Type/shape consistency:** `instanceEntry` emits `{ id, name, mainComponentSetId, variantOverrides?, componentPropertyOverrides?, resolvedStyles? }`; top-level emits `{ source, capturedAt, componentInstances, componentProperties?, mainComponent?, boundVariables?, depthWarnings? }` — consistent across steps and matches the spec's two tables and the consumer's read set. `boundVariables[].path` (property-path string) explicitly distinguished from the dropped per-instance `path` array.
