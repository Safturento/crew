import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FigmaNode, FigmaRestClient } from './client.js';
import { hashNode } from './hash.js';

export interface EmitSnapshotOptions {
  fileKey: string;
  pages: string[];
  outDir: string;
  client: FigmaRestClient;
  fetchImage?: (url: string) => Promise<Buffer>;
  imageScale?: number;
}

export interface EmitSnapshotResult {
  nodesExported: number;
}

interface IndexEntry {
  name: string;
  type: string;
  page: string;
  screenshotPath: string;
  metadataPath: string;
}

const PAGE_DIR_MAP: Record<string, string> = {
  Composites: 'composites',
  'Dashboard Screens': 'screens',
};

const EXPORTABLE_TYPES = new Set(['COMPONENT', 'COMPONENT_SET', 'FRAME']);

function pageDir(name: string): string {
  if (PAGE_DIR_MAP[name]) return PAGE_DIR_MAP[name];
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new Error(`figma page name '${name}' is not safe to use as a directory`);
  return slug;
}

function safeId(nodeId: string): string {
  return nodeId.replace(/:/g, '-');
}

async function defaultFetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function emitSnapshot(opts: EmitSnapshotOptions): Promise<EmitSnapshotResult> {
  const fetchImage = opts.fetchImage ?? defaultFetchImage;
  const file = await opts.client.getFile(opts.fileKey);

  await mkdir(opts.outDir, { recursive: true });

  const pages = (file.document.children ?? []).filter(
    (c) => c.type === 'CANVAS' && opts.pages.includes(c.name),
  );

  const targets: Array<{ node: FigmaNode; page: string; dir: string }> = [];
  for (const page of pages) {
    const dir = pageDir(page.name);
    await mkdir(join(opts.outDir, dir), { recursive: true });
    for (const child of page.children ?? []) {
      if (EXPORTABLE_TYPES.has(child.type)) {
        targets.push({ node: child, page: page.name, dir });
      }
    }
  }

  // meta.json sidecar — carries the content-scoped freshness baseline `crew
  // figma-snapshot --check` compares against. `nodeHashes` hashes each captured
  // node's *full* tree (the hash is computed before `raw` is slimmed below), so
  // `--check` is scoped to the captured nodes and ignores out-of-scope file
  // churn. `figmaFileVersion` is retained as informational only (it is the
  // whole-file save counter that produced false STALE reports; see CREW-174).
  // A sidecar, not an index.json field, so index.json's node-id consumers
  // (visual-fidelity-check iterates its keys) are untouched.
  const nodeHashes: Record<string, string> = {};
  for (const t of targets) {
    nodeHashes[t.node.id] = hashNode(t.node);
  }
  await writeFile(
    join(opts.outDir, 'meta.json'),
    `${JSON.stringify(
      { figmaFileVersion: file.version, capturedAt: new Date().toISOString(), nodeHashes },
      null,
      2,
    )}\n`,
  );

  const index: Record<string, IndexEntry> = {};

  // Write per-node metadata + index.json first, so a failing image pass can
  // never cost us the metadata the downstream validation depends on.
  for (const t of targets) {
    const id = safeId(t.node.id);
    const pngPath = join(t.dir, `${id}.png`);
    const jsonPath = join(t.dir, `${id}.json`);
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
    index[t.node.id] = {
      name: t.node.name,
      type: t.node.type,
      page: t.page,
      screenshotPath: pngPath,
      metadataPath: jsonPath,
    };
  }

  await writeFile(join(opts.outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

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

/**
 * Selective refresh of named nodes. Skips the full-file fetch by using Figma's
 * `/files/{key}/nodes?ids=...` endpoint. Buffers all per-node JSON + index
 * updates in memory and flushes atomically only after every requested ID has
 * resolved — a `null` from Figma fails the entire refresh, leaving the
 * snapshot byte-identical to before. `meta.json` is intentionally NOT
 * updated; `--check` keeps reporting stale until a full refresh runs.
 */
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
    console.warn(`figma-snapshot: image pass failed, snapshot has metadata only: ${String(err)}`);
  }
}
