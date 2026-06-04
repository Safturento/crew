import { describe, it, expect, vi } from 'vitest';
import { checkSnapshotFreshness } from './check.js';
import { hashNode } from './hash.js';
import type { FigmaNode } from './client.js';

const pill: FigmaNode = {
  id: '272:120',
  name: 'Pill',
  type: 'COMPONENT_SET',
  children: [{ id: 'x', name: 'variant', type: 'COMPONENT' }],
};
const drawer: FigmaNode = { id: '1:756', name: 'Agent drawer', type: 'FRAME', children: [] };

function nodesResponse(...nodes: Array<FigmaNode | null>) {
  const map: Record<string, { document: FigmaNode } | null> = {};
  for (const n of nodes) {
    if (n) map[n.id] = { document: n };
  }
  return { nodes: map };
}

describe('checkSnapshotFreshness', () => {
  it('reports fresh when every captured node hash matches the live tree', async () => {
    const client = {
      getFileNodes: vi.fn().mockResolvedValue(nodesResponse(pill, drawer)),
    };
    const result = await checkSnapshotFreshness({
      fileKey: 'FILEKEY',
      meta: { nodeHashes: { '272:120': hashNode(pill), '1:756': hashNode(drawer) } },
      client: client as never,
    });
    expect(result.status).toBe('fresh');
    expect(result.drifted).toEqual([]);
    // Only the captured node ids are requested — no full-file fetch.
    expect(client.getFileNodes).toHaveBeenCalledWith('FILEKEY', ['272:120', '1:756']);
  });

  it('reports stale and names the node whose content changed', async () => {
    const changedPill = { ...pill, name: 'Pill (v2)' };
    const client = {
      getFileNodes: vi.fn().mockResolvedValue(nodesResponse(changedPill, drawer)),
    };
    const result = await checkSnapshotFreshness({
      fileKey: 'FILEKEY',
      meta: { nodeHashes: { '272:120': hashNode(pill), '1:756': hashNode(drawer) } },
      client: client as never,
    });
    expect(result.status).toBe('stale');
    expect(result.drifted).toEqual([{ id: '272:120', reason: 'changed' }]);
  });

  it('reports stale with reason "missing" when a captured node was deleted from Figma', async () => {
    const client = {
      getFileNodes: vi.fn().mockResolvedValue(nodesResponse(drawer)),
    };
    const result = await checkSnapshotFreshness({
      fileKey: 'FILEKEY',
      meta: { nodeHashes: { '272:120': hashNode(pill), '1:756': hashNode(drawer) } },
      client: client as never,
    });
    expect(result.status).toBe('stale');
    expect(result.drifted).toEqual([{ id: '272:120', reason: 'missing' }]);
  });

  it('reports no-baseline when meta.json predates content-scoped hashing (no nodeHashes)', async () => {
    const client = { getFileNodes: vi.fn() };
    const result = await checkSnapshotFreshness({
      fileKey: 'FILEKEY',
      meta: { figmaFileVersion: 'v-old' },
      client: client as never,
    });
    expect(result.status).toBe('no-baseline');
    expect(client.getFileNodes).not.toHaveBeenCalled();
  });

  it('ignores out-of-scope file churn — only captured nodes are compared', async () => {
    // The live file has additional/changed nodes, but getFileNodes returns only
    // the requested captured ids, unchanged. Nothing in scope drifted → fresh.
    const client = {
      getFileNodes: vi.fn().mockResolvedValue(nodesResponse(pill)),
    };
    const result = await checkSnapshotFreshness({
      fileKey: 'FILEKEY',
      meta: { nodeHashes: { '272:120': hashNode(pill) }, figmaFileVersion: 'v-old' },
      client: client as never,
    });
    expect(result.status).toBe('fresh');
  });
});
