import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitSnapshot } from './emit.js';
import type { FigmaFileResponse, FigmaImagesResponse } from './client.js';

const fileResponse: FigmaFileResponse = {
  document: {
    id: '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: [
      {
        id: '212:630',
        name: 'Composites',
        type: 'CANVAS',
        children: [
          { id: '272:120', name: 'Pill', type: 'COMPONENT_SET', children: [] },
          { id: '300:1', name: 'Detached frame', type: 'FRAME', children: [] },
        ],
      },
      {
        id: '500:0',
        name: 'Dashboard Screens',
        type: 'CANVAS',
        children: [
          { id: '1:756', name: 'Agent drawer', type: 'FRAME', children: [] },
        ],
      },
      {
        id: '999:0',
        name: 'Sketches',
        type: 'CANVAS',
        children: [
          { id: '999:1', name: 'Junk', type: 'COMPONENT', children: [] },
        ],
      },
    ],
  },
};

const imagesResponse: FigmaImagesResponse = {
  images: {
    '272:120': 'https://cdn.figma.com/pill.png',
    '300:1': 'https://cdn.figma.com/frame.png',
    '1:756': 'https://cdn.figma.com/drawer.png',
  },
};

let outDir: string;

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'crew-snap-'));
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('emitSnapshot', () => {
  it('writes per-component PNG + JSON to page-keyed dirs and an index.json for the named pages only', async () => {
    const client = {
      getFile: vi.fn().mockResolvedValue(fileResponse),
      getImages: vi.fn().mockResolvedValue(imagesResponse),
    };
    const fetchImage = vi.fn().mockImplementation(async (url: string) =>
      Buffer.from(`fake-bytes-for:${url}`),
    );

    const result = await emitSnapshot({
      fileKey: 'FILEKEY',
      pages: ['Composites', 'Dashboard Screens'],
      outDir,
      client: client as never,
      fetchImage,
    });

    expect(result.nodesExported).toBe(3);

    expect(existsSync(join(outDir, 'composites/272-120.png'))).toBe(true);
    expect(existsSync(join(outDir, 'composites/272-120.json'))).toBe(true);
    expect(existsSync(join(outDir, 'composites/300-1.png'))).toBe(true);
    expect(existsSync(join(outDir, 'screens/1-756.png'))).toBe(true);
    expect(existsSync(join(outDir, 'screens/1-756.json'))).toBe(true);

    // Pages not in the configured list are skipped.
    expect(existsSync(join(outDir, 'sketches'))).toBe(false);

    const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
    expect(index['272:120']).toMatchObject({
      name: 'Pill',
      page: 'Composites',
      type: 'COMPONENT_SET',
      screenshotPath: 'composites/272-120.png',
      metadataPath: 'composites/272-120.json',
    });
    expect(index['1:756']).toMatchObject({
      name: 'Agent drawer',
      page: 'Dashboard Screens',
      type: 'FRAME',
      screenshotPath: 'screens/1-756.png',
      metadataPath: 'screens/1-756.json',
    });

    // PNG was written using fetchImage for the relevant CDN URLs.
    expect(fetchImage).toHaveBeenCalledWith('https://cdn.figma.com/pill.png');
    expect(fetchImage).toHaveBeenCalledWith('https://cdn.figma.com/drawer.png');
    expect(Buffer.from(readFileSync(join(outDir, 'composites/272-120.png'))).toString()).toBe(
      'fake-bytes-for:https://cdn.figma.com/pill.png',
    );

    // Per-component JSON includes id/name/type/page + raw node.
    const componentJson = JSON.parse(
      readFileSync(join(outDir, 'composites/272-120.json'), 'utf8'),
    );
    expect(componentJson).toMatchObject({
      id: '272:120',
      name: 'Pill',
      type: 'COMPONENT_SET',
      page: 'Composites',
    });
    expect(componentJson.raw.id).toBe('272:120');
  });

  it('returns nodesExported=0 and skips network when no pages match', async () => {
    const client = {
      getFile: vi.fn().mockResolvedValue(fileResponse),
      getImages: vi.fn(),
    };
    const result = await emitSnapshot({
      fileKey: 'FILEKEY',
      pages: ['nope'],
      outDir,
      client: client as never,
      fetchImage: async () => Buffer.from('x'),
    });
    expect(result.nodesExported).toBe(0);
    expect(client.getImages).not.toHaveBeenCalled();
    expect(existsSync(join(outDir, 'index.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'))).toEqual({});
  });

  it('still writes metadata when a node has no image URL (null in images response)', async () => {
    const client = {
      getFile: vi.fn().mockResolvedValue({
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:0',
              name: 'Composites',
              type: 'CANVAS',
              children: [{ id: '2:0', name: 'Empty', type: 'COMPONENT', children: [] }],
            },
          ],
        },
      } as FigmaFileResponse),
      getImages: vi.fn().mockResolvedValue({ images: { '2:0': null } } as FigmaImagesResponse),
    };
    const fetchImage = vi.fn();

    const result = await emitSnapshot({
      fileKey: 'FILEKEY',
      pages: ['Composites'],
      outDir,
      client: client as never,
      fetchImage,
    });

    expect(result.nodesExported).toBe(1);
    expect(fetchImage).not.toHaveBeenCalled();
    expect(existsSync(join(outDir, 'composites/2-0.png'))).toBe(false);
    expect(existsSync(join(outDir, 'composites/2-0.json'))).toBe(true);
  });
});
