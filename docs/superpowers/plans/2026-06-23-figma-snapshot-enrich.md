# `crew figma-snapshot --enrich` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `crew figma-snapshot --enrich <file>` mode that programmatically merges the `use_figma` enrichment map into the per-node snapshot files, with a fail-closed atomic write — removing the per-node hand-merge friction in the `figma-snapshot-refresh` skill.

**Architecture:** A new pure-filesystem lib module `merge.ts` validates a `{ nodeId: enrichment }` map against the committed `index.json` and atomically writes the `enrichment` field onto each per-node file (all-or-nothing). The `figma-snapshot` command routes a new `--enrich <file>` mode through the existing `runFigmaSnapshot` dispatcher (mirroring how `--node-id` routes to the partial path), so the logic is unit-testable via the exported function exactly like the existing paths.

**Tech Stack:** TypeScript, Node `node:fs`, commander, picocolors, vitest.

## Global Constraints

- Per `packages/cli/AGENTS.md`: subcommands are thin wrappers — business logic lives in `src/lib/`. The merge logic goes in `lib/figma-snapshot/merge.ts`, not the command file.
- `merge.ts` does no network I/O and does not import sibling lib subdirs — it is a pure local-filesystem transform.
- Per-node files are written as `JSON.stringify(obj, null, 2)` + a trailing `\n` (match `emit.ts`). The `raw` field is never modified; only the top-level `enrichment` field is set.
- Atomic / fail-closed: if **any** entry in the map fails validation, write **nothing** and report failure. Never produce a partially-enriched snapshot.
- `--enrich` does not touch `meta.json` (consistent with `--node-id` partial refresh).
- No HTTP route is added → no Bruno endpoint.

---

### Task 1: `mergeEnrichment` core (lib)

**Files:**
- Create: `packages/cli/src/lib/figma-snapshot/merge.ts`
- Modify: `packages/cli/src/lib/figma-snapshot/index.ts` (add re-export)
- Test: `packages/cli/src/lib/figma-snapshot/merge.test.ts`

**Interfaces:**
- Consumes: the committed `index.json` shape `Record<string, { name; type; page; screenshotPath; metadataPath }>` (from `emit.ts`); per-node JSON files `{ id, name, type, page, raw, enrichment? }`.
- Produces:
  - `interface MergeEnrichmentOpts { outDir: string; enrichmentMap: Record<string, EnrichmentEntry> }`
  - `interface EnrichmentEntry { source?: string; componentInstances?: unknown; error?: string; [k: string]: unknown }`
  - `interface MergeEnrichmentResult { refreshed: string[]; failed: Array<{ id: string; reason: string }> }`
  - `function mergeEnrichment(opts: MergeEnrichmentOpts): MergeEnrichmentResult` — throws only on fatal setup (missing/unparseable `index.json`).

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/lib/figma-snapshot/merge.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeEnrichment } from './merge.js';

let outDir: string;

// A valid enrichment object as emitted by enrichment-script.js (trimmed).
function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    source: 'plugin-api',
    capturedAt: '2026-06-23T00:00:00.000Z',
    componentProperties: null,
    mainComponent: null,
    boundVariables: [],
    componentInstances: [],
    depthWarnings: [],
    ...overrides,
  };
}

function writeNode(id: string, page: string) {
  const dir = join(outDir, page);
  mkdirSync(dir, { recursive: true });
  const fileName = `${id.replace(':', '-')}.json`;
  writeFileSync(
    join(dir, fileName),
    `${JSON.stringify({ id, name: `n-${id}`, type: 'COMPONENT', page, raw: { keep: 'me' } }, null, 2)}\n`,
  );
  return `${page}/${fileName}`;
}

function writeIndex(entries: Record<string, { page: string; metadataPath: string }>) {
  const index: Record<string, unknown> = {};
  for (const [id, e] of Object.entries(entries)) {
    index[id] = {
      name: `n-${id}`,
      type: 'COMPONENT',
      page: e.page,
      screenshotPath: e.metadataPath.replace('.json', '.png'),
      metadataPath: e.metadataPath,
    };
  }
  writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
}

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'merge-test-'));
});
afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('mergeEnrichment', () => {
  it('writes enrichment onto each per-node file and preserves raw', () => {
    const mp = writeNode('220:211', 'composites');
    writeIndex({ '220:211': { page: 'composites', metadataPath: mp } });

    const result = mergeEnrichment({
      outDir,
      enrichmentMap: { '220:211': validEntry({ componentInstances: [{ id: 'x' }] }) },
    });

    expect(result.failed).toEqual([]);
    expect(result.refreshed).toEqual(['220:211']);
    const written = JSON.parse(readFileSync(join(outDir, mp), 'utf8'));
    expect(written.raw).toEqual({ keep: 'me' });
    expect(written.enrichment.source).toBe('plugin-api');
    expect(written.enrichment.componentInstances).toEqual([{ id: 'x' }]);
  });

  it('fails a node whose entry carries an error and writes nothing', () => {
    const mp = writeNode('220:211', 'composites');
    writeIndex({ '220:211': { page: 'composites', metadataPath: mp } });
    const before = readFileSync(join(outDir, mp), 'utf8');

    const result = mergeEnrichment({
      outDir,
      enrichmentMap: { '220:211': { error: 'not found' } },
    });

    expect(result.refreshed).toEqual([]);
    expect(result.failed).toEqual([{ id: '220:211', reason: 'use_figma error: not found' }]);
    expect(readFileSync(join(outDir, mp), 'utf8')).toBe(before); // untouched
  });

  it('fails an id absent from index.json', () => {
    writeIndex({});
    const result = mergeEnrichment({ outDir, enrichmentMap: { '9:9': validEntry() } });
    expect(result.refreshed).toEqual([]);
    expect(result.failed).toEqual([{ id: '9:9', reason: 'not in committed snapshot index.json' }]);
  });

  it('fails a malformed (REST-only) entry', () => {
    const mp = writeNode('220:211', 'composites');
    writeIndex({ '220:211': { page: 'composites', metadataPath: mp } });
    const result = mergeEnrichment({
      outDir,
      enrichmentMap: { '220:211': { source: 'plugin-api' } }, // no componentInstances
    });
    expect(result.refreshed).toEqual([]);
    expect(result.failed[0]).toEqual({
      id: '220:211',
      reason: 'malformed enrichment (missing source or componentInstances)',
    });
  });

  it('is atomic: one bad entry leaves all files untouched', () => {
    const okPath = writeNode('1:1', 'composites');
    const badPath = writeNode('2:2', 'composites');
    writeIndex({
      '1:1': { page: 'composites', metadataPath: okPath },
      '2:2': { page: 'composites', metadataPath: badPath },
    });
    const okBefore = readFileSync(join(outDir, okPath), 'utf8');
    const badBefore = readFileSync(join(outDir, badPath), 'utf8');

    const result = mergeEnrichment({
      outDir,
      enrichmentMap: { '1:1': validEntry(), '2:2': { error: 'boom' } },
    });

    expect(result.refreshed).toEqual([]); // nothing written despite 1:1 being valid
    expect(result.failed).toEqual([{ id: '2:2', reason: 'use_figma error: boom' }]);
    expect(readFileSync(join(outDir, okPath), 'utf8')).toBe(okBefore);
    expect(readFileSync(join(outDir, badPath), 'utf8')).toBe(badBefore);
  });

  it('throws when index.json is absent', () => {
    expect(() => mergeEnrichment({ outDir, enrichmentMap: {} })).toThrow(/index\.json/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace crew-cli -- merge.test.ts`
Expected: FAIL — `Cannot find module './merge.js'` / `mergeEnrichment is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/cli/src/lib/figma-snapshot/merge.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface EnrichmentEntry {
  source?: string;
  componentInstances?: unknown;
  error?: string;
  [k: string]: unknown;
}

export interface MergeEnrichmentOpts {
  /** Snapshot directory containing index.json + per-node JSON files. */
  outDir: string;
  /** The `{ nodeId: enrichment }` map produced by the use_figma enrichment script. */
  enrichmentMap: Record<string, EnrichmentEntry>;
}

export interface MergeEnrichmentResult {
  refreshed: string[];
  failed: Array<{ id: string; reason: string }>;
}

interface IndexEntry {
  metadataPath: string;
}

/**
 * Merge a use_figma enrichment map into the committed per-node snapshot files.
 *
 * Validates every entry first; if any entry fails, writes nothing (atomic /
 * fail-closed) and returns the failures. Only the top-level `enrichment` field
 * is set — `raw` is never modified. Does not touch meta.json.
 *
 * Throws only on fatal setup errors (index.json missing or unparseable).
 */
export function mergeEnrichment(opts: MergeEnrichmentOpts): MergeEnrichmentResult {
  const indexPath = join(opts.outDir, 'index.json');
  if (!existsSync(indexPath)) {
    throw new Error(`no committed snapshot at ${opts.outDir} — index.json absent`);
  }
  let index: Record<string, IndexEntry>;
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8')) as Record<string, IndexEntry>;
  } catch (err) {
    throw new Error(`index.json is not valid JSON: ${(err as Error).message}`);
  }

  const failed: Array<{ id: string; reason: string }> = [];
  // Stage validated writes; only flush them when the whole batch is clean.
  const staged: Array<{ id: string; absPath: string; node: Record<string, unknown> }> = [];

  for (const [id, entry] of Object.entries(opts.enrichmentMap)) {
    if (entry && entry.error) {
      failed.push({ id, reason: `use_figma error: ${entry.error}` });
      continue;
    }
    const indexEntry = index[id];
    if (!indexEntry) {
      failed.push({ id, reason: 'not in committed snapshot index.json' });
      continue;
    }
    if (!(entry && entry.source === 'plugin-api' && Array.isArray(entry.componentInstances))) {
      failed.push({ id, reason: 'malformed enrichment (missing source or componentInstances)' });
      continue;
    }
    const absPath = join(opts.outDir, indexEntry.metadataPath);
    let node: Record<string, unknown>;
    try {
      node = JSON.parse(readFileSync(absPath, 'utf8')) as Record<string, unknown>;
    } catch (err) {
      failed.push({ id, reason: `cannot read per-node file ${indexEntry.metadataPath}: ${(err as Error).message}` });
      continue;
    }
    node.enrichment = entry;
    staged.push({ id, absPath, node });
  }

  if (failed.length > 0) {
    return { refreshed: [], failed };
  }

  const refreshed: string[] = [];
  for (const s of staged) {
    writeFileSync(s.absPath, `${JSON.stringify(s.node, null, 2)}\n`);
    refreshed.push(s.id);
  }
  return { refreshed, failed: [] };
}
```

- [ ] **Step 4: Add the re-export**

Modify `packages/cli/src/lib/figma-snapshot/index.ts` — append after the existing exports:

```ts
export * from './merge.js';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test --workspace crew-cli -- merge.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/figma-snapshot/merge.ts \
        packages/cli/src/lib/figma-snapshot/merge.test.ts \
        packages/cli/src/lib/figma-snapshot/index.ts
git commit -m "feat(cli): mergeEnrichment — atomic enrichment merge into snapshot files"
```

---

### Task 2: Wire `--enrich` into the `figma-snapshot` command

**Files:**
- Modify: `packages/cli/src/commands/figma-snapshot.ts`
- Test: `packages/cli/src/commands/figma-snapshot.test.ts`

**Interfaces:**
- Consumes: `mergeEnrichment` + `MergeEnrichmentResult` from `../lib/index.js` (Task 1).
- Produces:
  - `FigmaSnapshotDeps` gains `enrichFile?: string`.
  - `FigmaSnapshotResult` gains `nodesEnriched?: number`.
  - `runFigmaSnapshot` routes to enrichment when `deps.enrichFile` is set (returns `{ ok, reason?, nodesEnriched?, outDir? }`).
  - The command gains `--enrich <file>`, mutually exclusive with `--check` and `--node-id`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/cli/src/commands/figma-snapshot.test.ts` (inside the top-level `describe('runFigmaSnapshot', ...)`, after the existing partial-export block). These reuse the file's existing `makeDeps` / temp-dir helpers:

```ts
  describe('enrichment (--enrich)', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'enrich-cmd-'));
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    function setupSnapshot() {
      const snap = join(dir, '.crew/figma-snapshot');
      mkdirSync(join(snap, 'composites'), { recursive: true });
      writeFileSync(
        join(snap, 'composites', '220-211.json'),
        `${JSON.stringify({ id: '220:211', name: 'BrandMark', type: 'COMPONENT', page: 'Composites', raw: {} }, null, 2)}\n`,
      );
      writeFileSync(
        join(snap, 'index.json'),
        `${JSON.stringify({ '220:211': { name: 'BrandMark', type: 'COMPONENT', page: 'Composites', screenshotPath: 'composites/220-211.png', metadataPath: 'composites/220-211.json' } }, null, 2)}\n`,
      );
      return snap;
    }

    const vfConfig = {
      ...baseConfig,
      visual_fidelity: {
        figma_file_key: 'KEY',
        figma_pages: ['Composites'],
        snapshot_path: '.crew/figma-snapshot',
      },
    } as ProjectConfig;

    it('merges a valid enrichment file and reports the count', async () => {
      setupSnapshot();
      const enrichFile = join(dir, 'batch.json');
      writeFileSync(
        enrichFile,
        JSON.stringify({ '220:211': { source: 'plugin-api', componentInstances: [] } }),
      );

      const result = await runFigmaSnapshot(
        makeDeps({ worktree: dir, config: vfConfig, enrichFile }),
      );

      expect(result.ok).toBe(true);
      expect(result.nodesEnriched).toBe(1);
    });

    it('fails (ok:false) when an entry carries an error, writing nothing', async () => {
      const snap = setupSnapshot();
      const before = readFileSync(join(snap, 'composites', '220-211.json'), 'utf8');
      const enrichFile = join(dir, 'batch.json');
      writeFileSync(enrichFile, JSON.stringify({ '220:211': { error: 'not found' } }));

      const result = await runFigmaSnapshot(
        makeDeps({ worktree: dir, config: vfConfig, enrichFile }),
      );

      expect(result.ok).toBe(false);
      expect(result.reason).toContain('220:211');
      expect(readFileSync(join(snap, 'composites', '220-211.json'), 'utf8')).toBe(before);
    });

    it('fails cleanly when the enrich file is unparseable JSON', async () => {
      setupSnapshot();
      const enrichFile = join(dir, 'bad.json');
      writeFileSync(enrichFile, '{ not json');

      const result = await runFigmaSnapshot(
        makeDeps({ worktree: dir, config: vfConfig, enrichFile }),
      );

      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/JSON/i);
    });
  });
```

Ensure `beforeEach`/`afterEach` are imported from `vitest` at the top of the file (add them to the existing import if missing).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace crew-cli -- figma-snapshot.test.ts`
Expected: FAIL — `enrichFile` not on `FigmaSnapshotDeps` / enrichment path not routed (results come back as a normal export attempt).

- [ ] **Step 3: Implement the routing + `runEnrich`**

In `packages/cli/src/commands/figma-snapshot.ts`:

(a) Extend the import from `../lib/index.js` to include `mergeEnrichment`:

```ts
import {
  FigmaRestClient,
  checkSnapshotFreshness,
  discoverProjectConfig,
  emitPartialSnapshot,
  emitSnapshot,
  mergeEnrichment,
  type ProjectConfig,
  type SnapshotMeta,
} from '../lib/index.js';
```

(b) Add `enrichFile` to `FigmaSnapshotDeps` (after the `page?` field):

```ts
  // Enrichment-merge input. When set, runFigmaSnapshot routes to the merge path:
  // it reads this file ({ nodeId: enrichment } from use_figma) and merges it into
  // the committed per-node files. Mutually exclusive with nodeIds.
  enrichFile?: string;
```

(c) Add `nodesEnriched` to `FigmaSnapshotResult`:

```ts
  nodesEnriched?: number;
```

(d) In `runFigmaSnapshot`, route to enrichment before the partial/full branches (right after `outDir` is computed):

```ts
  // Route to enrichment-merge path if enrichFile was supplied.
  if (deps.enrichFile) {
    return runEnrich(deps, outDir);
  }

  // Route to partial path if nodeIds was supplied.
  if (deps.nodeIds && deps.nodeIds.length > 0) {
    return runPartial(deps, vf, outDir);
  }
```

(e) Add the `runEnrich` function (next to `runPartial`):

```ts
function runEnrich(deps: FigmaSnapshotDeps, outDir: string): FigmaSnapshotResult {
  const enrichFile = deps.enrichFile as string;
  let raw: string;
  try {
    raw = readFileSync(enrichFile, 'utf8');
  } catch (err) {
    return { ok: false, reason: `cannot read enrichment file ${enrichFile}: ${(err as Error).message}` };
  }
  let map: Record<string, unknown>;
  try {
    map = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, reason: `enrichment file is not valid JSON: ${(err as Error).message}` };
  }

  let result;
  try {
    result = mergeEnrichment({ outDir, enrichmentMap: map });
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  if (result.failed.length > 0) {
    const detail = result.failed.map((f) => `${f.id} (${f.reason})`).join(', ');
    return { ok: false, reason: `enrichment failed: ${detail}` };
  }
  deps.log(`enriched ${result.refreshed.length} node(s) → ${outDir}`);
  return { ok: true, nodesEnriched: result.refreshed.length, outDir };
}
```

Note: `runEnrich` is synchronous but returns a `FigmaSnapshotResult` (not a Promise); `runFigmaSnapshot` is `async`, so `return runEnrich(...)` is fine (the value is auto-wrapped).

- [ ] **Step 4: Add the `--enrich` option + exclusivity guard + render**

(a) Add the option to the command definition (after the `--page` option):

```ts
  .option(
    '--enrich <file>',
    'merge a use_figma enrichment map (JSON file of { nodeId: enrichment }) into the committed per-node snapshot files. Atomic/fail-closed: writes nothing if any node fails. Does NOT update meta.json.',
  )
```

(b) Replace the existing two-way exclusivity guard at the top of the action:

```ts
  .action(async (opts: { check?: boolean; nodeId?: string; page?: string; enrich?: string }) => {
    const modes = [opts.check, opts.nodeId, opts.enrich].filter(Boolean).length;
    if (modes > 1) {
      console.error(pc.red('✗'), '--check, --node-id, and --enrich are mutually exclusive');
      process.exit(1);
    }
```

(c) Pass `enrichFile` into the `runFigmaSnapshot` call (add to the deps object):

```ts
    const result = await runFigmaSnapshot({
      worktree: cwd,
      config,
      log: (msg) => console.log(pc.dim('→'), msg),
      nodeIds,
      page: opts.page,
      enrichFile: opts.enrich,
    });
```

(d) Add the success render branch (before the `nodesRefreshed` branch in the final block):

```ts
    if (typeof result.nodesEnriched === 'number') {
      console.log(pc.green('✓'), `figma-snapshot enrichment merged (${result.nodesEnriched} node(s))`);
    } else if (typeof result.nodesRefreshed === 'number') {
```

(adjust the existing `if (typeof result.nodesRefreshed ...)` to `else if`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --workspace crew-cli -- figma-snapshot.test.ts`
Expected: PASS (existing tests + 3 new enrichment tests).

- [ ] **Step 6: Lint + typecheck**

Run: `npm run lint --workspace crew-cli && npm run typecheck --workspace crew-cli`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/figma-snapshot.ts \
        packages/cli/src/commands/figma-snapshot.test.ts
git commit -m "feat(cli): figma-snapshot --enrich mode merges use_figma enrichment maps"
```

---

### Task 3: Doc parity

**Files:**
- Modify (as flagged): `.agents/commands.md`, `packages/cli/AGENTS.md` (the `figma-snapshot/` lib-subdir line / command list, only if the new flag/behavior is described there).

- [ ] **Step 1: Run the parity check**

Invoke the `agents-doc-parity-check` skill against the changed paths (`packages/cli/src/commands/figma-snapshot.ts`, `packages/cli/src/lib/figma-snapshot/*`). It matches the diff against each `.agents/<topic>.md` `covers:` glob.

- [ ] **Step 2: Update flagged docs**

For each doc the check flags: if it enumerates `figma-snapshot` modes or the `figma-snapshot/` lib concern, add a one-line mention of the `--enrich <file>` mode (post-export merge, atomic, does not touch `meta.json`). If nothing is flagged, record that and skip.

- [ ] **Step 3: Final verification**

Run: `npm run lint && npm run typecheck && npm test --workspace crew-cli`
Expected: clean across the CLI workspace.

- [ ] **Step 4: Commit (if docs changed)**

```bash
git add .agents/ packages/cli/AGENTS.md
git commit -m "docs(cli): note figma-snapshot --enrich mode"
```

---

## Out of scope for this plan (Ticket B — interactive)

The `figma-snapshot-refresh` SKILL.md rewrite (steps 4–6 → "Write the `use_figma` blob to a temp file → `crew figma-snapshot --enrich <file>` per batch"; delete the hand-merge guidance and the throwaway-`merge-enrichment.mjs` pattern) is **interactive** work — skill files cannot be written by `crew run` dispatch. It is blocked by this CLI work landing, and is tracked as a separate `interactive`-labelled ticket.

## Self-Review

- **Spec coverage:** CLI surface (Task 2 step 4) ✓; merge semantics table — error/unknown/malformed/valid (Task 1 tests + impl) ✓; atomicity (Task 1 atomic test + `failed.length` guard) ✓; `meta.json` untouched (`runEnrich` never calls emit/check) ✓; error handling — fatal vs per-node (Task 2 steps 3e/4) ✓; tests — `merge.test.ts` + command tests ✓; doc parity (Task 3) ✓; scope split noted ✓.
- **Placeholder scan:** none — every code/test step carries full content.
- **Type consistency:** `mergeEnrichment` / `MergeEnrichmentOpts` / `MergeEnrichmentResult` / `EnrichmentEntry` used identically in Task 1 and Task 2; `enrichFile` / `nodesEnriched` field names consistent between the `runEnrich` impl and the command-render/test steps. Failure-reason strings in `merge.ts` match the strings asserted in `merge.test.ts` verbatim.
