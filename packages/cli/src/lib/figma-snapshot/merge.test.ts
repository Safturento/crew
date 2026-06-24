import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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
