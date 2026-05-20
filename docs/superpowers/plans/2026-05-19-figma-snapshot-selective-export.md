# `crew figma-snapshot` selective export — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--node-id <ids>` (with optional `--page <name>`) to `crew figma-snapshot` so single-component edits refresh only the named nodes instead of forcing a full page-walk export.

**Architecture:** Two CLI flags route to a new `emitPartialSnapshot()` sibling of the existing full-export `emitSnapshot()`. The partial path calls Figma's `/v1/files/{key}/nodes?ids=...` REST endpoint via a new `FigmaRestClient.getFileNodes` method, buffers all per-node JSON + `index.json` updates in memory, and flushes atomically only after every requested ID has resolved (a `null` from Figma fails the whole refresh, leaving the snapshot byte-identical to before). `meta.json` is intentionally not touched — `--check` keeps reporting stale until a full refresh runs. The `figma-snapshot-refresh` skill grows a decision step so single-node touch-ups go through the partial path.

**Tech Stack:** Node 20 + TypeScript + commander + Figma REST v1 API. Vitest for tests; mock `fetch` and use temp directories for filesystem assertions.

**Inputs:**
- Spec: `docs/superpowers/specs/2026-05-19-figma-snapshot-selective-export-design.md`
- Existing code: `packages/cli/src/commands/figma-snapshot.ts`, `packages/cli/src/lib/figma-snapshot/{emit,client}.ts`
- Existing tests (patterns to mirror): `packages/cli/src/lib/figma-snapshot/{emit,client}.test.ts`, `packages/cli/src/commands/figma-snapshot.test.ts`
- Existing skill: `.claude/skills/figma-snapshot-refresh/SKILL.md`

---

## File structure

| File | Action | Responsibility after change |
|---|---|---|
| `packages/cli/src/lib/figma-snapshot/client.ts` | Modify (add `getFileNodes` method + `FigmaFileNodesResponse` type) | REST wrapper; gains the partial-fetch endpoint |
| `packages/cli/src/lib/figma-snapshot/client.test.ts` | Modify (one new test) | Asserts `getFileNodes` URL shape + response passthrough |
| `packages/cli/src/lib/figma-snapshot/emit.ts` | Modify (extract `runImagePass`; add `emitPartialSnapshot`; export new types) | Full export AND partial export; shared image-pass helper |
| `packages/cli/src/lib/figma-snapshot/emit.test.ts` | Modify (five new tests for the partial path) | Covers happy path, multi-page targets, fail-closed atomicity, image-pass non-fatal, sibling preservation |
| `packages/cli/src/commands/figma-snapshot.ts` | Modify (parse new flags; classify IDs against committed index.json; resolve `targets`; call partial emit; mutual-exclusion + validation gates) | CLI surface; routes to full or partial emit based on flags |
| `packages/cli/src/commands/figma-snapshot.test.ts` | Modify (five new tests covering validation + happy partial path) | Asserts command-layer routing + error messages |
| `.claude/skills/figma-snapshot-refresh/SKILL.md` | Modify (insert decision step; describe both refresh paths; add red-flag row) | Skill steers single-node touch-ups through partial path |
| `docs/followups.md` | Modify (Task 6 only — move 2026-05-19 entry from Active to Resolved + ToC update) | Reflects shipped state |

No new files. No new packages.

---

## Task 1 — `FigmaRestClient.getFileNodes`

**Files:**
- Modify: `packages/cli/src/lib/figma-snapshot/client.ts`
- Test: `packages/cli/src/lib/figma-snapshot/client.test.ts`

Add a new method that fetches a subset of a Figma file's nodes via the
`/v1/files/{key}/nodes?ids=...` endpoint. Figma returns `null` for IDs it
can't find (deleted, malformed) rather than erroring — the caller handles
that.

- [ ] **Step 1: Add the failing test**

Append inside `describe('FigmaRestClient', …)` in `client.test.ts` (after the existing `getFileMeta` test):

```ts
  it('getFileNodes calls /files/{key}/nodes with comma-joined ids and returns the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: {
          '212:910': { document: { id: '212:910', name: 'AgentRow', type: 'COMPONENT_SET', children: [] } },
          '1:2': null,
        },
      }),
    });
    const client = new FigmaRestClient({ token: 't', fetch: fetchMock });
    const res = await client.getFileNodes('FILEKEY', ['212:910', '1:2']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/^https:\/\/api\.figma\.com\/v1\/files\/FILEKEY\/nodes\?/);
    expect(url).toContain('ids=212%3A910%2C1%3A2');
    expect(res.nodes['212:910']).not.toBeNull();
    expect(res.nodes['1:2']).toBeNull();
  });
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npm run test:run --workspace=crew-cli -- client.test
```

Expected: FAIL — `client.getFileNodes is not a function`.

- [ ] **Step 3: Add the method + type to `client.ts`**

After the `FigmaImagesResponse` interface block (around line 30), insert:

```ts
export interface FigmaFileNodesResponse {
  nodes: Record<string, { document: FigmaNode } | null>;
}
```

Inside the `FigmaRestClient` class, after `getImages` (around line 115), add:

```ts
  /**
   * Fetch specific nodes by id via `/files/{key}/nodes?ids=...`. Used by the
   * selective-export path (`crew figma-snapshot --node-id ...`) to avoid the
   * full document fetch. Figma returns `null` for ids it can't find — callers
   * handle that case rather than throwing.
   */
  async getFileNodes(fileKey: string, nodeIds: string[]): Promise<FigmaFileNodesResponse> {
    const ids = nodeIds.join(',');
    const path = `/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(ids)}`;
    return this.req<FigmaFileNodesResponse>(path);
  }
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
npm run test:run --workspace=crew-cli -- client.test
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck --workspace=crew-cli
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/figma-snapshot/client.ts \
        packages/cli/src/lib/figma-snapshot/client.test.ts
git commit -m "feat(figma-snapshot): add FigmaRestClient.getFileNodes"
```

---

## Task 2 — Extract `runImagePass` helper from `emitSnapshot`

**Files:**
- Modify: `packages/cli/src/lib/figma-snapshot/emit.ts`

Pure refactor. The image-pass block in current `emitSnapshot` becomes a
module-level helper so Task 3's `emitPartialSnapshot` can reuse it without
duplicating the batching, halving-on-timeout, fetch-and-write loop, and the
two layers of warn-but-continue handling. No behavior change.

- [ ] **Step 1: Run the existing emit suite to baseline green**

```bash
npm run test:run --workspace=crew-cli -- emit.test
```

Expected: PASS — every existing test green.

- [ ] **Step 2: Add the helper and call it from `emitSnapshot`**

Replace `emit.ts` lines 113–133 (the `// Image pass — non-fatal.` block at
the end of `emitSnapshot`) with a single call:

```ts
  // Image pass — non-fatal. See runImagePass for the policy.
  if (targets.length > 0) {
    await runImagePass({
      fileKey: opts.fileKey,
      outDir: opts.outDir,
      client: opts.client,
      fetchImage,
      imageScale: opts.imageScale,
      targets: targets.map((t) => ({ nodeId: t.node.id, dir: t.dir })),
    });
  }

  return { nodesExported: targets.length };
}

interface RunImagePassOptions {
  fileKey: string;
  outDir: string;
  client: FigmaRestClient;
  fetchImage: (url: string) => Promise<Buffer>;
  imageScale?: number;
  targets: Array<{ nodeId: string; dir: string }>;
}

/**
 * Render PNGs for the given targets. Non-fatal per node and per batch:
 * a Figma render timeout, a CDN fetch failure, or even a wholesale `/images`
 * error all warn and skip the affected PNG(s) rather than aborting. The
 * metadata files are already on disk by the time this runs — image-pass
 * failures only cost the screenshots.
 */
async function runImagePass(opts: RunImagePassOptions): Promise<void> {
  try {
    const ids = opts.targets.map((t) => t.nodeId);
    const images = await opts.client.getImages(opts.fileKey, ids, opts.imageScale ?? 2);
    for (const t of opts.targets) {
      const cdnUrl = images.images[t.nodeId];
      if (!cdnUrl) continue;
      try {
        const buf = await opts.fetchImage(cdnUrl);
        await writeFile(join(opts.outDir, t.dir, `${safeId(t.nodeId)}.png`), buf);
      } catch (err) {
        console.warn(`figma-snapshot: image fetch failed for ${t.nodeId}: ${String(err)}`);
      }
    }
  } catch (err) {
    console.warn(`figma-snapshot: image pass failed: ${String(err)}`);
  }
}
```

Note: the existing `defaultFetchImage` function stays in place above
`emitSnapshot`. The new `runImagePass` requires `fetchImage` non-optional
(the caller defaults to `defaultFetchImage` itself).

- [ ] **Step 3: Run the existing emit suite, verify still green**

```bash
npm run test:run --workspace=crew-cli -- emit.test
```

Expected: PASS — same tests, same green. No behavior change.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck --workspace=crew-cli
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/figma-snapshot/emit.ts
git commit -m "refactor(figma-snapshot): extract runImagePass helper from emitSnapshot"
```

---

## Task 3 — `emitPartialSnapshot`

**Files:**
- Modify: `packages/cli/src/lib/figma-snapshot/emit.ts`
- Test: `packages/cli/src/lib/figma-snapshot/emit.test.ts`

Sibling to `emitSnapshot`. Reads the existing `index.json`, fetches just the
named nodes via `getFileNodes`, buffers all per-node JSON + index updates,
then flushes atomically only if every requested ID resolved. `meta.json` is
untouched. Image pass uses `runImagePass`.

- [ ] **Step 1: Add the failing tests**

Append five tests inside the existing `describe('emitSnapshot', …)` block.
Place them at the end of the file before the closing `});`:

```ts

describe('emitPartialSnapshot', () => {
  function seedSnapshot() {
    // Mirrors what a prior full export wrote: meta.json + two-page index.json + per-node JSONs.
    const meta = { figmaFileVersion: 'v-baseline', capturedAt: '2026-05-15T00:00:00Z' };
    const index = {
      '272:120': {
        name: 'Pill',
        type: 'COMPONENT_SET',
        page: 'Composites',
        screenshotPath: 'composites/272-120.png',
        metadataPath: 'composites/272-120.json',
      },
      '300:1': {
        name: 'Detached frame',
        type: 'FRAME',
        page: 'Composites',
        screenshotPath: 'composites/300-1.png',
        metadataPath: 'composites/300-1.json',
      },
      '1:756': {
        name: 'Agent drawer',
        type: 'FRAME',
        page: 'Dashboard Screens',
        screenshotPath: 'screens/1-756.png',
        metadataPath: 'screens/1-756.json',
      },
    };
    writeFileSync(join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
    writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
    mkdirSync(join(outDir, 'composites'), { recursive: true });
    mkdirSync(join(outDir, 'screens'), { recursive: true });
    for (const [id, e] of Object.entries(index)) {
      writeFileSync(
        join(outDir, e.metadataPath),
        `${JSON.stringify({ id, name: e.name, type: e.type, page: e.page, raw: { id, name: e.name, type: e.type, children: [] } }, null, 2)}\n`,
      );
    }
    return { meta, index };
  }

  it('refreshes a single target: writes new per-node JSON, updates its index entry, leaves siblings and meta untouched', async () => {
    const { meta: metaBefore } = seedSnapshot();
    const client = {
      getFile: vi.fn(),
      getImages: vi.fn().mockResolvedValue({ images: { '272:120': 'https://cdn/new-pill.png' } }),
      getFileNodes: vi.fn().mockResolvedValue({
        nodes: {
          '272:120': {
            document: { id: '272:120', name: 'Pill (v2)', type: 'COMPONENT_SET', children: [{ id: 'x', name: 'variant', type: 'COMPONENT' }] },
          },
        },
      }),
    };
    const fetchImage = vi.fn().mockResolvedValue(Buffer.from('new-pill-bytes'));

    const result = await emitPartialSnapshot({
      fileKey: 'FILEKEY',
      outDir,
      client: client as never,
      fetchImage,
      targets: [{ nodeId: '272:120', page: 'Composites', dir: 'composites' }],
    });

    expect(result.nodesRefreshed).toBe(1);

    // Named per-node JSON rewritten with new content
    const json = JSON.parse(readFileSync(join(outDir, 'composites/272-120.json'), 'utf8'));
    expect(json.name).toBe('Pill (v2)');
    expect(json.raw.children).toHaveLength(1);

    // index.json entry updated for the named node
    const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
    expect(index['272:120']).toMatchObject({ name: 'Pill (v2)', page: 'Composites' });

    // Siblings untouched
    expect(index['300:1']).toMatchObject({ name: 'Detached frame' });
    expect(index['1:756']).toMatchObject({ name: 'Agent drawer' });
    const siblingJson = JSON.parse(readFileSync(join(outDir, 'composites/300-1.json'), 'utf8'));
    expect(siblingJson.name).toBe('Detached frame');

    // meta.json untouched (byte-identical)
    const metaAfter = JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8'));
    expect(metaAfter).toEqual(metaBefore);

    // PNG was written for the refreshed node
    expect(readFileSync(join(outDir, 'composites/272-120.png')).toString()).toBe('new-pill-bytes');
  });

  it('refreshes multiple targets across different page dirs', async () => {
    seedSnapshot();
    const client = {
      getFile: vi.fn(),
      getImages: vi.fn().mockResolvedValue({
        images: {
          '272:120': 'https://cdn/pill.png',
          '1:756': 'https://cdn/drawer.png',
        },
      }),
      getFileNodes: vi.fn().mockResolvedValue({
        nodes: {
          '272:120': { document: { id: '272:120', name: 'Pill (v2)', type: 'COMPONENT_SET', children: [] } },
          '1:756': { document: { id: '1:756', name: 'Agent drawer (v2)', type: 'FRAME', children: [] } },
        },
      }),
    };

    const result = await emitPartialSnapshot({
      fileKey: 'FILEKEY',
      outDir,
      client: client as never,
      fetchImage: async (url) => Buffer.from(url),
      targets: [
        { nodeId: '272:120', page: 'Composites', dir: 'composites' },
        { nodeId: '1:756', page: 'Dashboard Screens', dir: 'screens' },
      ],
    });

    expect(result.nodesRefreshed).toBe(2);
    expect(existsSync(join(outDir, 'composites/272-120.json'))).toBe(true);
    expect(existsSync(join(outDir, 'screens/1-756.json'))).toBe(true);

    const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
    expect(index['272:120'].name).toBe('Pill (v2)');
    expect(index['1:756'].name).toBe('Agent drawer (v2)');
  });

  it('fails closed when Figma returns null for any requested ID — no disk writes, no index mutation', async () => {
    seedSnapshot();
    const indexBefore = readFileSync(join(outDir, 'index.json'), 'utf8');
    const componentJsonBefore = readFileSync(join(outDir, 'composites/272-120.json'), 'utf8');
    const client = {
      getFile: vi.fn(),
      getImages: vi.fn(),
      getFileNodes: vi.fn().mockResolvedValue({
        nodes: {
          '272:120': { document: { id: '272:120', name: 'Pill (v2)', type: 'COMPONENT_SET', children: [] } },
          '999:9': null,
        },
      }),
    };

    await expect(
      emitPartialSnapshot({
        fileKey: 'FILEKEY',
        outDir,
        client: client as never,
        fetchImage: async () => Buffer.from('x'),
        targets: [
          { nodeId: '272:120', page: 'Composites', dir: 'composites' },
          { nodeId: '999:9', page: 'Composites', dir: 'composites' },
        ],
      }),
    ).rejects.toThrow(/999:9/);

    // index.json and the per-node JSON for 272:120 are byte-identical to before
    expect(readFileSync(join(outDir, 'index.json'), 'utf8')).toBe(indexBefore);
    expect(readFileSync(join(outDir, 'composites/272-120.json'), 'utf8')).toBe(componentJsonBefore);

    // getImages is never called (we fail before the image pass)
    expect(client.getImages).not.toHaveBeenCalled();
  });

  it('image-pass failure is non-fatal — JSON and index already flushed, warning emitted', async () => {
    seedSnapshot();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = {
      getFile: vi.fn(),
      getImages: vi.fn().mockRejectedValue(new Error('Figma API 403 for /images')),
      getFileNodes: vi.fn().mockResolvedValue({
        nodes: {
          '272:120': { document: { id: '272:120', name: 'Pill (v2)', type: 'COMPONENT_SET', children: [] } },
        },
      }),
    };

    const result = await emitPartialSnapshot({
      fileKey: 'FILEKEY',
      outDir,
      client: client as never,
      fetchImage: vi.fn(),
      targets: [{ nodeId: '272:120', page: 'Composites', dir: 'composites' }],
    });

    expect(result.nodesRefreshed).toBe(1);
    // JSON was already flushed atomically before the image pass tried
    const json = JSON.parse(readFileSync(join(outDir, 'composites/272-120.json'), 'utf8'));
    expect(json.name).toBe('Pill (v2)');
    // No new PNG (image pass failed)
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('preserves sibling index entries byte-for-byte across a multi-target refresh', async () => {
    seedSnapshot();
    const indexBefore = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
    const client = {
      getFile: vi.fn(),
      getImages: vi.fn().mockResolvedValue({ images: { '272:120': null } }),
      getFileNodes: vi.fn().mockResolvedValue({
        nodes: {
          '272:120': { document: { id: '272:120', name: 'Pill (v2)', type: 'COMPONENT_SET', children: [] } },
        },
      }),
    };

    await emitPartialSnapshot({
      fileKey: 'FILEKEY',
      outDir,
      client: client as never,
      fetchImage: async () => Buffer.from('x'),
      targets: [{ nodeId: '272:120', page: 'Composites', dir: 'composites' }],
    });

    const indexAfter = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
    // Refreshed entry changed
    expect(indexAfter['272:120']).not.toEqual(indexBefore['272:120']);
    // Siblings byte-identical
    expect(indexAfter['300:1']).toEqual(indexBefore['300:1']);
    expect(indexAfter['1:756']).toEqual(indexBefore['1:756']);
  });
});
```

Add these imports to the top of `emit.test.ts` (alongside existing imports):

```ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { emitPartialSnapshot } from './emit.js';
```

- [ ] **Step 2: Run the new tests, verify they fail**

```bash
npm run test:run --workspace=crew-cli -- emit.test
```

Expected: FAIL — `emitPartialSnapshot is not a function` (and similar).
Existing `emitSnapshot` tests stay green.

- [ ] **Step 3: Implement `emitPartialSnapshot` in `emit.ts`**

Add the new exports + function. Place after `emitSnapshot` (before
`runImagePass` from Task 2):

```ts
export interface EmitPartialSnapshotOptions {
  fileKey: string;
  outDir: string;
  client: FigmaRestClient;
  fetchImage?: (url: string) => Promise<Buffer>;
  imageScale?: number;
  // Pre-resolved at the command layer. Each entry pairs a requested node ID
  // with the page directory it belongs in (looked up from committed index.json
  // for known IDs, or supplied via --page for unknown IDs).
  targets: Array<{ nodeId: string; page: string; dir: string }>;
}

export interface EmitPartialSnapshotResult {
  nodesRefreshed: number;
}

export async function emitPartialSnapshot(
  opts: EmitPartialSnapshotOptions,
): Promise<EmitPartialSnapshotResult> {
  const fetchImage = opts.fetchImage ?? defaultFetchImage;
  const ids = opts.targets.map((t) => t.nodeId);

  // 1. Fetch named nodes via /files/{key}/nodes.
  const response = await opts.client.getFileNodes(opts.fileKey, ids);

  // 2. Read existing index.json. Command layer guarantees it exists.
  const indexPath = join(opts.outDir, 'index.json');
  const index: Record<string, IndexEntry> = JSON.parse(await readFile(indexPath, 'utf8'));

  // 3. Buffer all writes; classify resolution outcomes.
  type PendingWrite = { absPath: string; contents: string; dir: string };
  const pendingWrites: PendingWrite[] = [];
  const notFound: string[] = [];
  const updatedIndex = { ...index };

  for (const t of opts.targets) {
    const entry = response.nodes[t.nodeId];
    if (!entry) {
      notFound.push(t.nodeId);
      continue;
    }
    const node = entry.document;
    const id = safeId(t.nodeId);
    const pngPath = join(t.dir, `${id}.png`);
    const jsonPath = join(t.dir, `${id}.json`);
    pendingWrites.push({
      absPath: join(opts.outDir, jsonPath),
      contents: `${JSON.stringify(
        { id: node.id, name: node.name, type: node.type, page: t.page, raw: node },
        null,
        2,
      )}\n`,
      dir: t.dir,
    });
    updatedIndex[t.nodeId] = {
      name: node.name,
      type: node.type,
      page: t.page,
      screenshotPath: pngPath,
      metadataPath: jsonPath,
    };
  }

  // 4. Fail-closed gate. Nothing has touched disk yet.
  if (notFound.length > 0) {
    throw new Error(
      `figma-snapshot: ${notFound.length} node(s) not found in Figma (likely deleted or bad id): ${notFound.join(', ')}`,
    );
  }

  // 5. Atomic flush — directories, per-node JSON, then index.json.
  const dirs = new Set(pendingWrites.map((w) => w.dir));
  for (const dir of dirs) {
    await mkdir(join(opts.outDir, dir), { recursive: true });
  }
  for (const w of pendingWrites) {
    await writeFile(w.absPath, w.contents);
  }
  await writeFile(indexPath, `${JSON.stringify(updatedIndex, null, 2)}\n`);

  // 6. Image pass via shared helper — non-fatal.
  if (opts.targets.length > 0) {
    await runImagePass({
      fileKey: opts.fileKey,
      outDir: opts.outDir,
      client: opts.client,
      fetchImage,
      imageScale: opts.imageScale,
      targets: opts.targets.map((t) => ({ nodeId: t.nodeId, dir: t.dir })),
    });
  }

  return { nodesRefreshed: opts.targets.length };
}
```

Also add a `readFile` import to the top of `emit.ts`:

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
```

- [ ] **Step 4: Run the partial-emit tests, verify they pass**

```bash
npm run test:run --workspace=crew-cli -- emit.test
```

Expected: PASS — every existing `emitSnapshot` test still green, all five
new `emitPartialSnapshot` tests green.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck --workspace=crew-cli
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/figma-snapshot/emit.ts \
        packages/cli/src/lib/figma-snapshot/emit.test.ts
git commit -m "feat(figma-snapshot): add emitPartialSnapshot with atomic buffered flush"
```

---

## Task 4 — `--node-id` + `--page` CLI flags

**Files:**
- Modify: `packages/cli/src/commands/figma-snapshot.ts`
- Test: `packages/cli/src/commands/figma-snapshot.test.ts`

The command layer parses the new flags, validates against `[visual_fidelity]`
config and the committed `index.json`, classifies IDs as known/unknown,
resolves a `targets` array, and routes to `emitPartialSnapshot`. The existing
full-export path stays put for the no-flag case; `--check` stays put for the
check case.

- [ ] **Step 1: Add the failing tests**

Append inside `describe('runFigmaSnapshot', …)` in `figma-snapshot.test.ts`:

```ts
  describe('partial export (--node-id)', () => {
    function makeSeededWorktree() {
      const worktree = mkdtempSync(join(tmpdir(), 'crew-fig-partial-'));
      const snapDir = join(worktree, '.crew/figma-snapshot');
      mkdirSync(snapDir, { recursive: true });
      const index = {
        '272:120': {
          name: 'Pill',
          type: 'COMPONENT_SET',
          page: 'Composites',
          screenshotPath: 'composites/272-120.png',
          metadataPath: 'composites/272-120.json',
        },
      };
      writeFileSync(join(snapDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
      writeFileSync(
        join(snapDir, 'meta.json'),
        `${JSON.stringify({ figmaFileVersion: 'v-baseline', capturedAt: '2026-05-15T00:00:00Z' }, null, 2)}\n`,
      );
      return { worktree, snapDir };
    }

    const configWithVf: ProjectConfig = {
      ...baseConfig,
      visual_fidelity: {
        figma_file_key: 'FILEKEY',
        figma_pages: ['Composites', 'Dashboard Screens'],
        component_dir: 'src',
        dashboard_url: 'http://x',
        snapshot_path: '.crew/figma-snapshot',
        code_connect_glob: '**/*.figma.tsx',
      },
    };

    it('rejects when no committed snapshot exists (no index.json)', async () => {
      const worktree = mkdtempSync(join(tmpdir(), 'crew-fig-partial-empty-'));
      try {
        const result = await runFigmaSnapshot({
          worktree,
          config: configWithVf,
          log: () => {},
          nodeIds: ['272:120'],
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/no committed snapshot/i);
      } finally {
        rmSync(worktree, { recursive: true, force: true });
      }
    });

    it('rejects an unknown node id without --page', async () => {
      const { worktree } = makeSeededWorktree();
      try {
        const result = await runFigmaSnapshot({
          worktree,
          config: configWithVf,
          log: () => {},
          nodeIds: ['999:999'],
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/not in committed snapshot/i);
        expect(result.reason).toMatch(/--page/);
      } finally {
        rmSync(worktree, { recursive: true, force: true });
      }
    });

    it('rejects --page that is not in figma_pages', async () => {
      const { worktree } = makeSeededWorktree();
      try {
        const result = await runFigmaSnapshot({
          worktree,
          config: configWithVf,
          log: () => {},
          nodeIds: ['999:999'],
          page: 'Sketches',
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/Sketches/);
        expect(result.reason).toMatch(/Composites/);
      } finally {
        rmSync(worktree, { recursive: true, force: true });
      }
    });

    it('rejects a known node when --page names a different page', async () => {
      const { worktree } = makeSeededWorktree();
      try {
        const result = await runFigmaSnapshot({
          worktree,
          config: configWithVf,
          log: () => {},
          nodeIds: ['272:120'],
          page: 'Dashboard Screens',
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/272:120/);
        expect(result.reason).toMatch(/Composites/);
        expect(result.reason).toMatch(/Dashboard Screens/);
      } finally {
        rmSync(worktree, { recursive: true, force: true });
      }
    });

    it('partial-refreshes a known node, leaves meta.json untouched, returns nodesRefreshed=1', async () => {
      const { worktree, snapDir } = makeSeededWorktree();
      try {
        const client = {
          getFile: vi.fn(),
          getImages: vi.fn().mockResolvedValue({ images: { '272:120': 'https://cdn/x.png' } }),
          getFileNodes: vi.fn().mockResolvedValue({
            nodes: {
              '272:120': { document: { id: '272:120', name: 'Pill (v2)', type: 'COMPONENT_SET', children: [] } },
            },
          }),
        };
        const metaBefore = readFileSync(join(snapDir, 'meta.json'), 'utf8');

        const result = await runFigmaSnapshot({
          worktree,
          config: configWithVf,
          log: () => {},
          clientFactory: () => client as never,
          fetchImage: async () => Buffer.from('bytes'),
          nodeIds: ['272:120'],
        });

        expect(result.ok).toBe(true);
        expect(result.nodesRefreshed).toBe(1);
        expect(client.getFileNodes).toHaveBeenCalledWith('FILEKEY', ['272:120']);
        expect(client.getFile).not.toHaveBeenCalled();

        // meta.json is byte-identical.
        expect(readFileSync(join(snapDir, 'meta.json'), 'utf8')).toBe(metaBefore);
        // index.json reflects the refreshed name.
        const index = JSON.parse(readFileSync(join(snapDir, 'index.json'), 'utf8'));
        expect(index['272:120'].name).toBe('Pill (v2)');
      } finally {
        rmSync(worktree, { recursive: true, force: true });
      }
    });
  });
```

Add the missing imports at the top of `figma-snapshot.test.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
```

- [ ] **Step 2: Run the new tests, verify they fail**

```bash
npm run test:run --workspace=crew-cli -- figma-snapshot.test
```

Expected: FAIL — the `nodeIds` / `page` properties aren't on
`FigmaSnapshotDeps` yet; partial path isn't implemented.

- [ ] **Step 3: Extend `runFigmaSnapshot` + CLI to handle the new flags**

Replace `packages/cli/src/commands/figma-snapshot.ts` with:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import {
  FigmaRestClient,
  discoverProjectConfig,
  emitPartialSnapshot,
  emitSnapshot,
  type ProjectConfig,
} from '../lib/index.js';

export interface FigmaSnapshotDeps {
  worktree: string;
  config: ProjectConfig;
  log: (msg: string) => void;
  clientFactory?: () => FigmaRestClient;
  fetchImage?: (url: string) => Promise<Buffer>;
  // Partial-export inputs. When `nodeIds` is set, runFigmaSnapshot routes to
  // the partial path instead of the full page-walk export.
  nodeIds?: string[];
  page?: string;
}

export interface FigmaSnapshotResult {
  ok: boolean;
  reason?: string;
  nodesExported?: number;
  nodesRefreshed?: number;
  outDir?: string;
}

interface IndexEntrySummary {
  name: string;
  type: string;
  page: string;
  screenshotPath: string;
  metadataPath: string;
}

function pageDirFor(name: string): string {
  // Same logic as emit.ts's pageDir. Duplicated to keep the command layer
  // free of emit-internal imports; small and stable.
  const map: Record<string, string> = {
    Composites: 'composites',
    'Dashboard Screens': 'screens',
  };
  if (map[name]) return map[name];
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function runFigmaSnapshot(deps: FigmaSnapshotDeps): Promise<FigmaSnapshotResult> {
  const vf = deps.config.visual_fidelity;
  if (!vf) {
    return {
      ok: false,
      reason: `no [visual_fidelity] block in project config '${deps.config.name}' — nothing to snapshot`,
    };
  }
  const outDir = join(deps.worktree, vf.snapshot_path);

  // Route to partial path if nodeIds was supplied.
  if (deps.nodeIds && deps.nodeIds.length > 0) {
    return runPartial(deps, vf, outDir);
  }

  try {
    const client = deps.clientFactory ? deps.clientFactory() : new FigmaRestClient();
    deps.log(`exporting pages ${vf.figma_pages.join(', ')} → ${outDir}`);
    const { nodesExported } = await emitSnapshot({
      fileKey: vf.figma_file_key,
      pages: vf.figma_pages,
      outDir,
      client,
      fetchImage: deps.fetchImage,
    });
    deps.log(`exported ${nodesExported} nodes`);
    return { ok: true, nodesExported, outDir };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

async function runPartial(
  deps: FigmaSnapshotDeps,
  vf: NonNullable<ProjectConfig['visual_fidelity']>,
  outDir: string,
): Promise<FigmaSnapshotResult> {
  const indexPath = join(outDir, 'index.json');
  if (!existsSync(indexPath)) {
    return {
      ok: false,
      reason: `no committed snapshot at ${vf.snapshot_path} — run \`crew figma-snapshot\` (full export) first`,
    };
  }

  const nodeIds = deps.nodeIds ?? [];
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as Record<string, IndexEntrySummary>;
  const known = nodeIds.filter((id) => index[id] !== undefined);
  const unknown = nodeIds.filter((id) => index[id] === undefined);

  if (unknown.length > 0 && !deps.page) {
    return {
      ok: false,
      reason: `node(s) ${unknown.join(', ')} not in committed snapshot — pass --page <name> to add them, or run \`crew figma-snapshot\` for a full export`,
    };
  }

  if (deps.page && !vf.figma_pages.includes(deps.page)) {
    return {
      ok: false,
      reason: `page '${deps.page}' not in [visual_fidelity].figma_pages (configured: ${vf.figma_pages.join(', ')})`,
    };
  }

  // Page-mismatch gate: known IDs must be on the --page if --page is set.
  if (deps.page) {
    const mismatched = known.filter((id) => index[id]!.page !== deps.page);
    if (mismatched.length > 0) {
      const example = mismatched[0]!;
      return {
        ok: false,
        reason: `node ${example} is on page '${index[example]!.page}', not '${deps.page}'; partial refresh does not move nodes between pages`,
      };
    }
  }

  const targets = nodeIds.map((id) => {
    const existing = index[id];
    if (existing) {
      const dir = existing.metadataPath.split('/').slice(0, -1).join('/');
      return { nodeId: id, page: existing.page, dir };
    }
    // Unknown — use --page (validated above to be non-empty).
    return { nodeId: id, page: deps.page!, dir: pageDirFor(deps.page!) };
  });

  try {
    const client = deps.clientFactory ? deps.clientFactory() : new FigmaRestClient();
    deps.log(`partial refresh: ${nodeIds.length} node(s) → ${outDir}`);
    const { nodesRefreshed } = await emitPartialSnapshot({
      fileKey: vf.figma_file_key,
      outDir,
      client,
      fetchImage: deps.fetchImage,
      targets,
    });
    deps.log(`refreshed ${nodesRefreshed} node(s); meta.json intentionally not updated — \`--check\` will continue to report stale until a full refresh`);
    return { ok: true, nodesRefreshed, outDir };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

export const figmaSnapshotCommand = new Command('figma-snapshot')
  .description(
    "export the project's Figma file to <worktree>/.crew/figma-snapshot/ for agent visual verification",
  )
  .option(
    '--check',
    'report whether the committed snapshot is stale vs the live Figma file, without regenerating',
  )
  .option(
    '--node-id <ids>',
    'comma-separated Figma node IDs to refresh selectively (skips the full file fetch). Each ID must already exist in the committed snapshot OR --page must be supplied. Does NOT update meta.json; --check will keep reporting stale.',
  )
  .option(
    '--page <name>',
    'page name for unknown IDs in --node-id (must match a configured page in [visual_fidelity].figma_pages)',
  )
  .action(async (opts: { check?: boolean; nodeId?: string; page?: string }) => {
    if (opts.check && opts.nodeId) {
      console.error(pc.red('✗'), '--check and --node-id are mutually exclusive');
      process.exit(1);
    }

    const cwd = process.cwd();
    const config = await discoverProjectConfig(cwd);
    if (!config) {
      console.error(pc.red('✗'), `no crew project config matches ${cwd}`);
      process.exit(1);
    }

    if (opts.check) {
      const vf = config.visual_fidelity;
      if (!vf) {
        console.error(
          pc.red('✗'),
          `no [visual_fidelity] block in project config '${config.name}' — nothing to check`,
        );
        process.exit(1);
      }
      const metaPath = join(cwd, vf.snapshot_path, 'meta.json');
      if (!existsSync(metaPath)) {
        console.error(
          pc.red('✗'),
          `no committed snapshot at ${vf.snapshot_path} (meta.json absent)`,
        );
        process.exit(1);
      }
      const committed = JSON.parse(readFileSync(metaPath, 'utf8')) as { figmaFileVersion: string };
      const live = await new FigmaRestClient().getFileMeta(vf.figma_file_key);
      if (committed.figmaFileVersion === live.version) {
        console.log(pc.green('✓'), `snapshot is fresh (Figma version ${live.version})`);
        return;
      }
      console.error(
        pc.yellow('!'),
        `snapshot is STALE — committed ${committed.figmaFileVersion}, live ${live.version}. ` +
          'Run the figma-snapshot-refresh skill.',
      );
      process.exit(1);
    }

    const nodeIds = opts.nodeId
      ? opts.nodeId
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : undefined;

    if (opts.nodeId && (!nodeIds || nodeIds.length === 0)) {
      console.error(pc.red('✗'), '--node-id requires at least one node ID');
      process.exit(1);
    }

    const result = await runFigmaSnapshot({
      worktree: cwd,
      config,
      log: (msg) => console.log(pc.dim('→'), msg),
      nodeIds,
      page: opts.page,
    });
    if (!result.ok) {
      console.error(pc.red('✗'), result.reason ?? 'figma-snapshot failed');
      process.exit(1);
    }
    if (result.reason) {
      console.log(pc.dim('→'), result.reason);
    }
    if (typeof result.nodesRefreshed === 'number') {
      console.log(pc.green('✓'), `figma-snapshot partial refresh complete (${result.nodesRefreshed} node(s))`);
    } else {
      console.log(pc.green('✓'), `figma-snapshot complete (${result.nodesExported ?? 0} nodes)`);
    }
  });
```

Note the new `emitPartialSnapshot` re-export from `lib/index.ts`. Add the
export now in `packages/cli/src/lib/figma-snapshot/index.ts`:

```bash
grep -l 'emitSnapshot' packages/cli/src/lib/figma-snapshot/index.ts
```

If the line `export * from './emit.js';` is present, both `emitSnapshot` and
`emitPartialSnapshot` are already re-exported (one wildcard covers both). No
edit needed. If it's a named export, add `emitPartialSnapshot` to the list.

- [ ] **Step 4: Run the new tests, verify they pass**

```bash
npm run test:run --workspace=crew-cli -- figma-snapshot.test
```

Expected: PASS — all five new tests + the three existing tests green.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck --workspace=crew-cli
```

Expected: clean.

- [ ] **Step 6: Run the full crew-cli suite**

```bash
npm run test:run --workspace=crew-cli
```

Expected: every test green.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/figma-snapshot.ts \
        packages/cli/src/commands/figma-snapshot.test.ts
git commit -m "feat(figma-snapshot): --node-id flag for selective export"
```

---

## Task 5 — Skill procedure update

**Files:**
- Modify: `.claude/skills/figma-snapshot-refresh/SKILL.md`

Insert the partial/full decision step. The existing enrichment script and
the procedure's overall structure are preserved.

- [ ] **Step 1: Read the current `SKILL.md`**

```bash
cat .claude/skills/figma-snapshot-refresh/SKILL.md
```

Read the procedure block — locate the existing steps 1–6.

- [ ] **Step 2: Rewrite the procedure to insert the decision step**

Replace the existing `## Procedure` section with:

````markdown
## Procedure

- [ ] **1. Freshness check.** Run `crew figma-snapshot --check`. If it reports
  `fresh`, STOP — the committed snapshot already matches the live Figma file.

- [ ] **2. Choose: full or partial refresh.**

  - **Partial refresh** when you can name the changed nodes (single-component
    edit; a few siblings; a renamed instance). Proceed to step 3p.
  - **Full refresh** when you don't know what changed, a token/variable edit
    cascaded everywhere, or you want to catch up after several edits.
    Proceed to step 3f.

  Partial is strictly faster (one REST call + one `use_figma` batch), but it
  does NOT update `meta.json`. `--check` will keep reporting stale until a
  full refresh runs. That's intentional — partial refresh fixes the named
  nodes; full refresh is the catch-all.

- [ ] **3p. Partial refresh — REST export.** Run
  `crew figma-snapshot --node-id <id>[,<id>...]`. Add `--page <name>` only if
  any ID is genuinely new (not yet in committed `index.json`). The CLI rejects
  with a clear error message if an ID is missing without `--page`. Skip to
  step 4.

- [ ] **3f. Full refresh — REST export.** Run `crew figma-snapshot` (no flag).
  Writes `index.json`, `meta.json`, and per-node `raw` JSON + PNGs to
  `.crew/figma-snapshot/`. REST-only — no `enrichment` field yet.

- [ ] **4. Enrich.** Invoke the `figma-use` skill (mandatory before any
  `use_figma` call), then call `mcp__plugin_figma_figma__use_figma` with the
  contents of `enrichment-script.js` (this skill's directory) — substitute
  `<NODE_IDS_JSON>` with a JSON array of node IDs, and pass the project's
  `figma_file_key`. The script returns `{ nodeId: enrichmentObject }`.

  - For **partial refresh**, the ID list is exactly what you passed to
    `--node-id`. Usually a single `use_figma` call (well under the ~20 KB
    response budget).
  - For **full refresh**, the ID list is every key of `index.json`. Batch
    sized so each result stays under ~20 KB (≈5–8 nodes typical); use the
    sizing probe (the same script with the final line changed to
    `out[id] = JSON.stringify(enrichment).length;`) to size batches.

- [ ] **5. Merge.** For each returned entry, add its enrichment object as a
  top-level `enrichment` field on that node's per-node JSON file (path is in
  `index.json`'s `metadataPath`). Do NOT modify the `raw` field. Partial
  refresh touches only the named nodes' files; siblings stay untouched.

- [ ] **6. Verify — fail closed.** Confirm every refreshed node now has a
  populated `enrichment.componentInstances`. Partial refresh verifies only
  the named nodes. If `use_figma` errored, any refreshed node is unenriched,
  or the script returned `{ error }` for a node — STOP and surface the
  failure. Do **not** commit a REST-only or partially-enriched snapshot.

- [ ] **7. Commit.** `git add .crew/figma-snapshot/` then commit.
````

- [ ] **Step 3: Add the new red-flag row**

In the `## Red flags — STOP` section, add one new row to the table:

```markdown
| "I'll partial-refresh and update meta.json myself" | Don't. meta.json's staleness is the safe signal that siblings may have drifted. Full refresh is the way to clear stale. |
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/figma-snapshot-refresh/SKILL.md
git commit -m "docs(skill): figma-snapshot-refresh learns partial-refresh path"
```

---

## Task 6 — Verification + resolve followup + manual smoke

**Files:**
- Modify: `docs/followups.md` (move the 2026-05-19 entry to Resolved)
- No code changes

- [ ] **Step 1: Full crew-cli test suite + typecheck + lint**

```bash
npm run test:run --workspace=crew-cli
npm run typecheck --workspace=crew-cli
npm run lint
```

Expected: all clean.

- [ ] **Step 2: Manual smoke against the live Figma file**

Run the partial refresh against the AgentRow component (the use case that
prompted this work — the `xs → sm` action-button edit needs to land in the
committed snapshot before the CREW-176 implementation `crew run`):

```bash
crew figma-snapshot --node-id 212:910
```

Expected output:

```
→ partial refresh: 1 node(s) → /home/safturento/Repos/crew/.crew/figma-snapshot
→ refreshed 1 node(s); meta.json intentionally not updated — `--check` will continue to report stale until a full refresh
✓ figma-snapshot partial refresh complete (1 node(s))
```

Verify the working tree:

```bash
git status --short
```

Expected: exactly `M .crew/figma-snapshot/composites/212-910.json` and
`M .crew/figma-snapshot/composites/212-910.png` and
`M .crew/figma-snapshot/index.json`. `meta.json` is byte-identical.

Run `--check` to confirm stale-reporting persists:

```bash
crew figma-snapshot --check
```

Expected: `! snapshot is STALE — committed <oldVersion>, live <newVersion>. Run the figma-snapshot-refresh skill.` Exit code non-zero.

- [ ] **Step 3: Enrich the refreshed node via `use_figma`**

Run the `figma-use` skill, then call `use_figma` with `enrichment-script.js`
substituted to enrich just `212:910` (single-node batch). Merge the result
into `.crew/figma-snapshot/composites/212-910.json` as the `enrichment`
field. Verify the node carries `enrichment.componentInstances`.

- [ ] **Step 4: Move the followup entry to Resolved**

In `docs/followups.md`:

1. Locate `### 2026-05-19 — \`crew figma-snapshot\` has no per-node refresh — single-component edits require a full export` under `## Active`.
2. Cut the entire entry (heading + body, including the "2026-05-19 update" addendum on the related 2026-05-12 entry stays in place — that one is still active).
3. Wait — confirm: the 2026-05-19 entry being moved is the standalone "no per-node refresh" entry, NOT the augmented 2026-05-12 entry. They're separate concerns.
4. Paste into `## Resolved`, just under the section heading.
5. Append a `**Resolved 2026-05-19:**` line: `Shipped `--node-id <ids>` flag (with optional `--page <name>` escape hatch for unknown IDs) on `crew figma-snapshot`. Single-node refresh now uses Figma's `/files/{key}/nodes` endpoint instead of the full document fetch. Snapshot at composites/212-910 refreshed via partial export to capture the AgentRow xs→sm action-button edit. Spec: `docs/superpowers/specs/2026-05-19-figma-snapshot-selective-export-design.md`; plan: `docs/superpowers/plans/2026-05-19-figma-snapshot-selective-export.md`.`
6. Update the `## Contents` ToC: move the corresponding bullet from `Active` to `Resolved` (anchor slug unchanged since heading text is unchanged).

- [ ] **Step 5: Commit the followup move + snapshot refresh**

```bash
git add docs/followups.md .crew/figma-snapshot/
git commit -m "docs(followups): resolve figma-snapshot per-node refresh; refresh AgentRow snapshot via --node-id"
```

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin docs/figma-snapshot-selective-export-spec
gh pr create --title "feat(figma-snapshot): selective --node-id export" --body "$(cat <<'EOF'
## Summary

- Add `--node-id <ids>` (with optional `--page <name>`) to `crew figma-snapshot`. Uses Figma's `/files/{key}/nodes?ids=...` endpoint via new `FigmaRestClient.getFileNodes`; skips the full document fetch entirely.
- New `emitPartialSnapshot` (sibling to `emitSnapshot`) buffers all per-node JSON + `index.json` writes for atomic flush — a null from Figma fails the whole refresh, leaving the snapshot byte-identical to before.
- `meta.json` is intentionally not touched on partial refresh. `--check` keeps reporting stale until a full refresh — by design, so siblings that may have drifted aren't masked.
- `figma-snapshot-refresh` skill learns a decision step that routes single-node touch-ups through the partial path.
- AgentRow snapshot refreshed via the new flag (`--node-id 212:910`) to capture the xs → sm action-button edit. This was a hard prereq for CREW-176 — unblocks the AgentRow card-redesign `crew run`.
- 2026-05-19 followup moved to Resolved with scope note.

## Test plan

- [x] `npm run test:run --workspace=crew-cli` — full crew-cli suite green
- [x] `npm run typecheck --workspace=crew-cli` — clean
- [x] `npm run lint` — clean
- [x] Manual smoke: `crew figma-snapshot --node-id 212:910` against the live Crew Figma file; only AgentRow files changed in git status; meta.json byte-identical; `--check` still reports stale
- [x] Manual enrichment of refreshed node via `use_figma` + `enrichment-script.js`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

Spec coverage (each spec section → task):

| Spec section | Implementing task |
|---|---|
| CLI surface (flags + validation order) | Task 4 |
| `getFileNodes` method | Task 1 |
| `emitPartialSnapshot` (procedure, buffered atomic flush) | Task 3 |
| `runImagePass` extraction | Task 2 |
| Tests across all three layers | Tasks 1, 3, 4 |
| Skill procedure update | Task 5 |
| Verification + smoke against real Figma | Task 6 Steps 1–2 |
| Followup correction | Task 6 Step 4 |

Type consistency: `FigmaFileNodesResponse.nodes[id] = { document: FigmaNode } | null` consistent in Task 1, Task 3 test setup, and Task 3 implementation. `targets: Array<{ nodeId, page, dir }>` consistent across Task 3 implementation, Task 3 tests, Task 4 command-layer resolution.

No placeholders: every code change shows full code; every command shows expected output; verification gates name the specific files to inspect.
