import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitPartialSnapshot, emitSnapshot } from './emit.js';
import type { FigmaFileResponse, FigmaImagesResponse } from './client.js';

const fileResponse: FigmaFileResponse = {
  version: 'v-fixture',
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
        children: [{ id: '1:756', name: 'Agent drawer', type: 'FRAME', children: [] }],
      },
      {
        id: '999:0',
        name: 'Sketches',
        type: 'CANVAS',
        children: [{ id: '999:1', name: 'Junk', type: 'COMPONENT', children: [] }],
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
    const fetchImage = vi
      .fn()
      .mockImplementation(async (url: string) => Buffer.from(`fake-bytes-for:${url}`));

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
    const componentJson = JSON.parse(readFileSync(join(outDir, 'composites/272-120.json'), 'utf8'));
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

  it('sanitizes non-whitelisted page names into safe slugs (no path separators or traversal)', async () => {
    const client = {
      getFile: vi.fn().mockResolvedValue({
        version: 'v-fixture',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:0',
              name: '../Escape Hatch',
              type: 'CANVAS',
              children: [{ id: '2:0', name: 'X', type: 'COMPONENT', children: [] }],
            },
          ],
        },
      } as FigmaFileResponse),
      getImages: vi.fn().mockResolvedValue({ images: { '2:0': null } } as FigmaImagesResponse),
    };

    const result = await emitSnapshot({
      fileKey: 'FILEKEY',
      pages: ['../Escape Hatch'],
      outDir,
      client: client as never,
      fetchImage: async () => Buffer.from('x'),
    });
    expect(result.nodesExported).toBe(1);
    expect(existsSync(join(outDir, '..'))).toBe(true); // tmp parent always exists
    // No leakage into outDir's parent: the sanitized slug stays inside outDir.
    expect(existsSync(join(outDir, 'escape-hatch/2-0.json'))).toBe(true);
  });

  it('writes all per-node JSON + index.json even when the image pass fails entirely', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = {
      getFile: vi.fn().mockResolvedValue(fileResponse),
      getImages: vi.fn().mockRejectedValue(new Error('Figma API 403 for /images: Invalid token')),
    };
    const fetchImage = vi.fn();

    const result = await emitSnapshot({
      fileKey: 'FILEKEY',
      pages: ['Composites', 'Dashboard Screens'],
      outDir,
      client: client as never,
      fetchImage,
    });

    expect(result.nodesExported).toBe(3);
    // Every per-node JSON + the index were written despite the image failure.
    expect(existsSync(join(outDir, 'composites/272-120.json'))).toBe(true);
    expect(existsSync(join(outDir, 'composites/300-1.json'))).toBe(true);
    expect(existsSync(join(outDir, 'screens/1-756.json'))).toBe(true);
    expect(existsSync(join(outDir, 'index.json'))).toBe(true);
    const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
    expect(index['272:120']).toMatchObject({ name: 'Pill', page: 'Composites' });
    // No PNGs, fetchImage never reached, warning emitted, no throw.
    expect(existsSync(join(outDir, 'composites/272-120.png'))).toBe(false);
    expect(fetchImage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips a single PNG whose image fetch fails and still completes the snapshot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = {
      getFile: vi.fn().mockResolvedValue(fileResponse),
      getImages: vi.fn().mockResolvedValue(imagesResponse),
    };
    const fetchImage = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'https://cdn.figma.com/pill.png') throw new Error('image fetch 500');
      return Buffer.from(`bytes:${url}`);
    });

    const result = await emitSnapshot({
      fileKey: 'FILEKEY',
      pages: ['Composites', 'Dashboard Screens'],
      outDir,
      client: client as never,
      fetchImage,
    });

    expect(result.nodesExported).toBe(3);
    // The failed image is skipped; its metadata is still present.
    expect(existsSync(join(outDir, 'composites/272-120.png'))).toBe(false);
    expect(existsSync(join(outDir, 'composites/272-120.json'))).toBe(true);
    // The other images were still written.
    expect(existsSync(join(outDir, 'composites/300-1.png'))).toBe(true);
    expect(existsSync(join(outDir, 'screens/1-756.png'))).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('still writes metadata when a node has no image URL (null in images response)', async () => {
    const client = {
      getFile: vi.fn().mockResolvedValue({
        version: 'v-fixture',
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

  it('writes meta.json with the Figma file version', async () => {
    const client = {
      getFile: vi.fn().mockResolvedValue({ ...fileResponse, version: 'v-test-123' }),
      getImages: vi.fn().mockResolvedValue(imagesResponse),
    };

    await emitSnapshot({
      fileKey: 'FILEKEY',
      pages: ['Composites'],
      outDir,
      client: client as never,
      fetchImage: async () => Buffer.from('x'),
    });

    const meta = JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8'));
    expect(meta.figmaFileVersion).toBe('v-test-123');
    expect(typeof meta.capturedAt).toBe('string');
  });
});

describe('emitPartialSnapshot', () => {
  function seedSnapshot() {
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
        `${JSON.stringify(
          {
            id,
            name: e.name,
            type: e.type,
            page: e.page,
            raw: { id, name: e.name, type: e.type, children: [] },
          },
          null,
          2,
        )}\n`,
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
            document: {
              id: '272:120',
              name: 'Pill (v2)',
              type: 'COMPONENT_SET',
              children: [{ id: 'x', name: 'variant', type: 'COMPONENT' }],
            },
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

    const json = JSON.parse(readFileSync(join(outDir, 'composites/272-120.json'), 'utf8'));
    expect(json.name).toBe('Pill (v2)');
    expect(json.raw.children).toHaveLength(1);

    const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
    expect(index['272:120']).toMatchObject({ name: 'Pill (v2)', page: 'Composites' });

    expect(index['300:1']).toMatchObject({ name: 'Detached frame' });
    expect(index['1:756']).toMatchObject({ name: 'Agent drawer' });
    const siblingJson = JSON.parse(readFileSync(join(outDir, 'composites/300-1.json'), 'utf8'));
    expect(siblingJson.name).toBe('Detached frame');

    const metaAfter = JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8'));
    expect(metaAfter).toEqual(metaBefore);

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
          '272:120': {
            document: { id: '272:120', name: 'Pill (v2)', type: 'COMPONENT_SET', children: [] },
          },
          '1:756': {
            document: { id: '1:756', name: 'Agent drawer (v2)', type: 'FRAME', children: [] },
          },
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
    const componentJsonBefore = readFileSync(
      join(outDir, 'composites/272-120.json'),
      'utf8',
    );
    const client = {
      getFile: vi.fn(),
      getImages: vi.fn(),
      getFileNodes: vi.fn().mockResolvedValue({
        nodes: {
          '272:120': {
            document: { id: '272:120', name: 'Pill (v2)', type: 'COMPONENT_SET', children: [] },
          },
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

    expect(readFileSync(join(outDir, 'index.json'), 'utf8')).toBe(indexBefore);
    expect(readFileSync(join(outDir, 'composites/272-120.json'), 'utf8')).toBe(componentJsonBefore);

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
          '272:120': {
            document: { id: '272:120', name: 'Pill (v2)', type: 'COMPONENT_SET', children: [] },
          },
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
    const json = JSON.parse(readFileSync(join(outDir, 'composites/272-120.json'), 'utf8'));
    expect(json.name).toBe('Pill (v2)');
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
          '272:120': {
            document: { id: '272:120', name: 'Pill (v2)', type: 'COMPONENT_SET', children: [] },
          },
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
    expect(indexAfter['272:120']).not.toEqual(indexBefore['272:120']);
    expect(indexAfter['300:1']).toEqual(indexBefore['300:1']);
    expect(indexAfter['1:756']).toEqual(indexBefore['1:756']);
  });
});
