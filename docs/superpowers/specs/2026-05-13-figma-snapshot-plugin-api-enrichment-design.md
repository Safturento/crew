# Figma snapshot — Plugin-API enrichment

**Date:** 2026-05-13
**Status:** Spec — pending implementation plan
**Related context:** The visual-fidelity-check skill calibration (PR #181, PR #184) showed the skill catches _patterns_ of UI regression accurately but produces _specifically wrong_ fixes when the snapshot lacks per-instance `componentProperties` and variable bindings. This spec adds those fields to the snapshot.

## Context

`crew figma-snapshot` ([CREW-139](https://github.com/Safturento/crew/pull/180)) exports the Figma file's relevant pages to `<worktree>/.crew/figma-snapshot/` for the dispatched agent's `visual-fidelity-check` skill (per the [agent visual verification design](2026-05-12-agent-visual-verification-design.md)). The current implementation uses the Figma REST API exclusively. Two calibration runs of the skill against the CREW-135 fixture (`docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/runs/`) plus user-in-the-loop visual review revealed the same root cause behind three different wrong-fix patterns:

- **Wrong icon recommendation.** Skill flagged View PR's Unicode `↗` as needing an SVG, recommended `lucide/arrow-up-right`. The real Figma instance uses `lucide/git-pull-request`. The Open as page button (different code site, same skill check) genuinely _does_ use `lucide/arrow-up-right` — but the skill couldn't distinguish them.
- **Wrong color recommendation.** Skill flagged the New Run button as having a helper-level shade bug (`bg-neutral-200` vs `zinc/50`). The real bug is caller-side: `TopNav.tsx` uses `color="white"` where the Figma instance uses `color="idle"`. The helper is correct.
- **Wrong primitive recommendation.** Skill twice hedged the state-badge dot as "judgment call — visually equivalent" despite the iterated "icon findings are NEVER judgment calls" rule. The user's side-by-side screenshot proved the dot is visibly different (code: filled circle; Figma: outlined ring).

Each case has the same structural cause: Figma's REST API does not expose `componentProperties` on instance nodes or variable bindings on paints. The skill has to guess what the design intent is. This spec replaces the guesswork with verified Plugin-API data.

The Plugin-API path is well-established in this session — `mcp__plugin_figma_figma__use_figma` runs JavaScript in the Figma Plugin API context via the figma-mcp-server. The bridge needed is an entry point for `crew figma-snapshot` to call this MCP tool. The chosen approach (per brainstorming): shell out to `claude -p` with a structured prompt; this leverages existing infrastructure without building a custom MCP client.

## Scope

In scope:

- New module at `packages/cli/src/lib/figma-snapshot/plugin-api-enrichment.ts` orchestrating a Plugin-API enrichment pass that runs after the existing REST emit.
- Wire the enrichment pass into `crew figma-snapshot` (in `packages/cli/src/commands/figma-snapshot.ts`) so it runs by default when `claude` is available.
- New prompt template at `packages/cli/src/lib/figma-snapshot/enrichment-prompt.md` that the subprocess uses. Templated with the snapshot dir + Figma file key per invocation.
- Per-node JSONs gain an `enrichment` field containing `componentProperties` (for `INSTANCE` nodes), `mainComponent` (resolved master pointer), and `boundVariables` (paint-level bindings with alias chains).
- Graceful fallback: if `claude` is absent or the subprocess fails, log a warning and leave the snapshot as REST-only. The dispatched agent's skill still works at pattern-accuracy without enrichment.
- Unit + integration tests covering: skip-when-`claude`-absent, parse subprocess stdout summary, validate in-place file writes.
- README + project-config doc update noting the new dependency on `claude` for full-fidelity snapshots.

Out of scope (separate followups):

- **Caching the snapshot across dispatches.** Each `crew run` regenerates. If this becomes a measurable productivity drag, file-version-keyed cache is the v2 path.
- **Direct MCP client in Node** (replaces the `claude` subprocess). v2 path if subprocess proves too slow or expensive. Subprocess gets us shipped fast; direct-MCP is the optimization.
- **Replacing REST with Plugin-API entirely.** REST handles image rendering well; no reason to move it. Hybrid stays.
- **Skill iteration on top of the enriched data.** The skill changes that take advantage of the new `componentProperties` and `boundVariables` are a separate follow-up after this lands (`visual-fidelity-check` workflow.md updates + re-calibration against the CREW-135 fixture).
- **The "ultimate test"** (screenshot-vs-Figma rigorous enumeration). Stays a separate Phase A continuation that follows skill re-iteration.

## Architecture

```
crew figma-snapshot
    ├─► [unchanged] runFigmaSnapshot
    │       └─► [unchanged] emitSnapshot (lib/figma-snapshot/emit.ts)
    │             - REST: get file + images
    │             - write index.json + composites/<id>.{png,json} + screens/<id>.{png,json}
    │
    └─► [new] enrichSnapshotWithPluginApi (lib/figma-snapshot/plugin-api-enrichment.ts)
          1. Probe `claude` on PATH
             ├─► absent: warn + return { kind: 'skipped' }
             └─► present: continue
          2. Compose prompt (template + interpolated context)
          3. Spawn `claude -p '<prompt>'` with figma MCP allowed, 90s timeout
          4. Parse stdout summary, validate file mutation
          5. Return { kind: 'ok', enrichedCount, errors } or { kind: 'warning', reason }
```

The enrichment pass runs **after** the REST emit and operates on the existing on-disk snapshot. It does not modify `emit.ts` or the REST client. Decoupling means:

- The REST path stays the source of truth for screenshots + the bulk node tree.
- The Plugin-API pass only writes the `enrichment` field — REST data is never mutated.
- If enrichment is skipped (no `claude` on PATH or subprocess fails), the snapshot is still complete-at-pattern-level for the skill.

The orchestration in `commands/figma-snapshot.ts`:

```ts
const emitResult = await emitSnapshot(...);                   // existing
const enrichmentResult = await enrichSnapshotWithPluginApi({  // new
  snapshotDir,
  config,
  log,
  warn,
});
return { ok: true, nodesExported: emitResult.nodesExported, enrichment: enrichmentResult };
```

`runPreDispatchFigmaSnapshot` ([CREW-140](https://github.com/Safturento/crew/pull/183)) calls `runFigmaSnapshot` and surfaces the result; it gets the enrichment status for free without changes.

## Data shape

The per-node JSON keeps `raw` (REST data) unchanged and adds a top-level `enrichment` field. Distinguishability matters — readers should be able to tell which data came from REST vs Plugin-API.

```jsonc
{
  "id": "275:1355",
  "name": "Pill",
  "type": "INSTANCE",
  "page": "Dashboard Screens",
  "raw": {
    /* full REST node, unchanged from CREW-139 */
  },
  "enrichment": {
    "source": "plugin-api",
    "capturedAt": "2026-05-13T18:30:00Z",
    "componentProperties": {
      "type": "pill",
      "color": "waiting",
      "intensity": "mid",
      "Has Icon": true,
      "Icon": { "id": "lucide/circle", "name": "lucide/circle" },
      "Label": "Waiting",
    },
    "mainComponent": {
      "id": "271:276",
      "name": "type=pill, color=waiting, intensity=mid",
      "parentSetName": "Pill",
    },
    "boundVariables": [
      {
        "path": "fills[0].color",
        "variableId": "VariableID:1234:567",
        "variableName": "amber-1050",
        "resolvedAlias": "amber-1050",
        "resolvedHex": "#26282A",
      },
      {
        "path": "strokes[0].color",
        "variableId": "VariableID:1234:568",
        "variableName": "amber/500",
        "resolvedAlias": "state/waiting -> amber/400",
        "resolvedHex": "#F59E0B",
      },
    ],
  },
}
```

For nodes that aren't `INSTANCE` and have no bound variables (e.g. a top-level COMPONENT_SET on the Composites page), the `enrichment` field still exists with empty arrays + `null` for `componentProperties` / `mainComponent`. This is "we tried and found nothing" — explicit signal vs "we never enriched this node." When the enrichment pass is skipped entirely (no `claude`), the JSON has NO `enrichment` field, and the skill can detect this and degrade gracefully.

### `boundVariables` shape

The Plugin API's `node.boundVariables` is structured by property path (e.g. `fills.0.color` → `{ id, type: 'VARIABLE_ALIAS' }`). The enrichment pass flattens this to an array of `{ path, variableId, variableName, resolvedAlias, resolvedHex }`. Resolution chains follow the variable's alias graph until reaching a non-alias value or a depth limit (5 hops). The `resolvedAlias` field is the `→`-separated chain (e.g. `state/waiting -> amber/400`), matching the convention already used in the CREW-135 fixture snapshot JSON.

### `componentProperties` shape

Plugin API's `node.componentProperties` returns `Record<string, { type, value, boundVariables? }>`. The enrichment pass simplifies to `Record<string, value>` for ergonomic skill consumption, with one exception: `INSTANCE_SWAP` properties resolve the referenced node and surface `{ id, name }` so the skill can read "Icon: lucide/circle" directly without an extra lookup. This is the data point that closes the View PR / Open as page / state-badge-dot icon-mismatch gap.

## Bridge protocol

### Spawn

```ts
import { execa } from 'execa';

const args = [
  '-p',
  promptText,
  '--mcp-config',
  '<inline-config-or-file>', // ensure figma MCP is available
];

const result = await execa('claude', args, {
  timeout: 90_000,
  cwd: snapshotDir,
});
```

The MCP config arg may already be inherited from the user's `~/.claude/settings.json`; verify during plan. If the figma MCP isn't auto-loaded, we pass a one-shot MCP config inline.

### Prompt template

`packages/cli/src/lib/figma-snapshot/enrichment-prompt.md`:

```markdown
# Snapshot enrichment task

You are a one-shot enrichment worker for `crew figma-snapshot`. Your job is to walk
the snapshot at `{{SNAPSHOT_DIR}}` and add Plugin-API-only data to each per-node
JSON (`componentProperties`, `mainComponent`, `boundVariables`).

## Inputs

- Snapshot index: `{{SNAPSHOT_DIR}}/index.json`
- Figma file key: `{{FIGMA_FILE_KEY}}`
- Pages covered: `{{FIGMA_PAGES_JSON}}`

## Procedure

1. Read `{{SNAPSHOT_DIR}}/index.json`. For each entry, read the metadata path.
2. For each per-node JSON, look up the node in Figma via `mcp__plugin_figma_figma__use_figma`
   with the JavaScript script in the next section.
3. Merge the returned enrichment into the JSON's `enrichment` field (do not modify `raw`).
4. Write a one-line stdout summary in JSON: `{"enrichedNodeCount": N, "errors": [...]}`.

## JavaScript payload to pass to `use_figma`

(Templated server-side, deterministic across runs. The skill author owns this.)

\`\`\`js
const node = await figma.getNodeByIdAsync('<NODE_ID>');
if (!node) return { error: 'not found' };

const enrichment = {
source: 'plugin-api',
capturedAt: new Date().toISOString(),
componentProperties: null,
mainComponent: null,
boundVariables: [],
};

if (node.type === 'INSTANCE') {
const cp = node.componentProperties || {};
enrichment.componentProperties = {};
for (const [key, prop] of Object.entries(cp)) {
let value = prop.value;
if (prop.type === 'INSTANCE_SWAP' && prop.value) {
try {
const ref = await figma.getNodeByIdAsync(prop.value);
if (ref) value = { id: prop.value, name: ref.name };
} catch (e) { /_ leave value as id string _/ }
}
// Strip the trailing #id from the key (e.g. "Has Icon#272:225" -> "Has Icon")
enrichment.componentProperties[key.split('#')[0]] = value;
}
if (node.mainComponent) {
enrichment.mainComponent = {
id: node.mainComponent.id,
name: node.mainComponent.name,
parentSetName: node.mainComponent.parent?.name ?? null,
};
}
}

// Walk node + paint properties for boundVariables
// ... (full payload spec'd in plan)

return enrichment;
\`\`\`
```

### Subprocess output contract

The subprocess writes a one-line JSON summary to stdout as its last line. The parent parses:

```jsonc
{
  "enrichedNodeCount": 50,
  "errors": [{ "nodeId": "1:99", "reason": "node not found" }],
}
```

Any deviation from this shape → parent treats as `kind: 'warning'`.

### Failure modes

| Failure                                          | Detection            | Parent response                                                               |
| ------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------- |
| `claude` not on PATH                             | `which claude` fails | `kind: 'skipped'`, info log                                                   |
| Subprocess timeout (>90s)                        | execa timeout        | `kind: 'warning'`, warn log                                                   |
| Subprocess exits non-zero                        | exit code            | `kind: 'warning'`, warn log, include stderr summary                           |
| Subprocess stdout doesn't end with JSON summary  | JSON.parse fails     | `kind: 'warning'`, warn log                                                   |
| `enrichedNodeCount === 0` despite no errors      | summary check        | `kind: 'warning'`, warn log                                                   |
| Partial enrichment (some errors but >0 enriched) | summary parse        | `kind: 'ok'` with warnings; surfaces errors as a one-line log per node failed |

In ALL warning cases, the REST data on disk is intact and the dispatched agent's skill still works at pattern-accuracy.

## Testing strategy

### Unit tests (`plugin-api-enrichment.test.ts`)

- **Skip-when-claude-absent.** Mock `which claude` to fail. Assert function returns `{ kind: 'skipped' }`, no subprocess spawned.
- **Skip when project config has `skip_plugin_api_enrichment = true`** (escape hatch, see Plan-phase decision below).
- **Subprocess success path.** Mock `execa` to return canned stdout `{"enrichedNodeCount": 5, "errors": []}`. Assert return value matches, log lines correct.
- **Subprocess timeout.** Mock `execa` to throw timeout. Assert `kind: 'warning'`, warn log mentions timeout.
- **Subprocess non-zero exit.** Mock `execa` to exit 1 with stderr. Assert `kind: 'warning'`, warn log includes stderr summary.
- **Malformed stdout.** Mock with `{"foo": "bar"}`. Assert `kind: 'warning'`.

### Integration test (`plugin-api-enrichment.integration.test.ts`)

- Build a mock snapshot dir with sample REST-emitted JSONs.
- Stub `execa` to write enriched JSON to the on-disk files (simulating what claude would do).
- Run `enrichSnapshotWithPluginApi`, then read the JSONs back and assert the `enrichment` field is present and matches the canned output.

### Manual end-to-end

After merge, run `crew figma-snapshot` against the Crew dashboard's `[visual_fidelity]` config:

```bash
export FIGMA_API_TOKEN=<token>
cd /home/safturento/Repos/crew
crew figma-snapshot
cat .crew/figma-snapshot/screens/<some-screen-with-instances>.json | jq '.enrichment'
```

Eyeball-verify: `componentProperties` populated, `mainComponent` resolved, `boundVariables` array non-empty for nodes with paints. Run time should be in the 20-60s range total (REST + Plugin-API enrichment).

### Skill re-calibration (follow-up activity)

Not part of this spec's implementation, but tracks here so it doesn't get lost: after this lands, re-run `visual-fidelity-check` calibration against the CREW-135 fixture using the new enriched snapshot. Verify:

- F4: skill correctly identifies caller-side wrong color enum (`color="white"` vs Figma's `color="idle"`)
- F5: skill correctly recommends `lucide/git-pull-request` for View PR and `lucide/arrow-up-right` for Open as page (different icons per instance)
- F7: skill correctly identifies the badge dot's `lucide/circle` (outlined) as the Figma intent

## Dependencies + sequencing

This work depends on:

- `crew figma-snapshot` from CREW-139 ✓ (merged)
- `crew run` dispatch integration from CREW-140 ✓ (merged)

Nothing else blocks. The implementation can be a single ticket on its own — no Epic needed.

When this lands, it unblocks:

- Skill re-calibration (workflow.md tightening + new fixture run)
- The "ultimate test" screenshot-vs-Figma calibration

## Open questions

None remaining at spec time. Decisions made during brainstorm:

- Architecture: **hybrid** (REST for screenshots + Plugin-API for enrichment)
- Default behavior: **default-on with graceful fallback** (try Plugin-API; warn + degrade if unavailable)
- Caching: **none for v1** (regenerate every dispatch)
- Bridge: **`claude` subprocess** with a structured prompt (deferred direct-MCP-client to v2 if subprocess proves slow/expensive)

## Followups noted during spec

- **Direct MCP client** as a v2 path if subprocess startup time (~5-10s) + LLM cost become a problem in practice. Filed as a future evaluation, not a current ticket.
- **Caching** as a v2 path once snapshot generation time becomes a measurable productivity drag. Likely file-version-keyed.
- **An optional `skip_plugin_api_enrichment` flag in `[visual_fidelity]` config** as an escape hatch for projects that want REST-only behavior (e.g. CI where `claude` is intentionally absent and the warning is noise). Plan-phase decides whether to include this in v1 or defer.
