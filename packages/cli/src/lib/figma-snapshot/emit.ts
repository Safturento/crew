import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FigmaNode, FigmaRestClient } from './client.js';

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

  const index: Record<string, IndexEntry> = {};

  if (targets.length > 0) {
    const ids = targets.map((t) => t.node.id);
    const images = await opts.client.getImages(opts.fileKey, ids, opts.imageScale ?? 2);

    for (const t of targets) {
      const id = safeId(t.node.id);
      const pngPath = join(t.dir, `${id}.png`);
      const jsonPath = join(t.dir, `${id}.json`);
      const cdnUrl = images.images[t.node.id];
      if (cdnUrl) {
        const buf = await fetchImage(cdnUrl);
        await writeFile(join(opts.outDir, pngPath), buf);
      }
      await writeFile(
        join(opts.outDir, jsonPath),
        `${JSON.stringify(
          { id: t.node.id, name: t.node.name, type: t.node.type, page: t.page, raw: t.node },
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
  }

  await writeFile(join(opts.outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

  return { nodesExported: targets.length };
}
