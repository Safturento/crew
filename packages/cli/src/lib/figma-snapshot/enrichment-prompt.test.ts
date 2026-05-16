import { describe, it, expect } from 'vitest';
import { buildEnrichmentPrompt } from './enrichment-prompt.js';

describe('buildEnrichmentPrompt', () => {
  it('embeds the snapshot directory absolute path', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/my-snapshot',
      fileKey: 'ABC123',
    });
    expect(prompt).toContain('/tmp/my-snapshot');
  });

  it('embeds the figma file key', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: '9FeJPriqdsdA4n9R5Xsrr8',
    });
    expect(prompt).toContain('9FeJPriqdsdA4n9R5Xsrr8');
  });

  it('includes the use_figma MCP tool name', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    expect(prompt).toContain('mcp__plugin_figma_figma__use_figma');
  });

  it('mentions the index.json input path', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    expect(prompt).toContain('index.json');
  });

  it('mentions the summary stdout contract', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    expect(prompt).toContain('enrichedNodeCount');
  });
});

describe('buildEnrichmentPrompt — nested-instance walk', () => {
  it('embeds a depth-bounded recursive walk in the Plugin-API script', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    // The script should iterate children and accumulate componentInstances entries.
    expect(prompt).toContain('componentInstances');
    expect(prompt).toContain('walkChildren');
    // Depth cap at 6 per spec §1.
    expect(prompt).toMatch(/depth\s*[<>=]\s*6/);
  });

  it("script emits each nested instance's mainComponent set id and variantOverrides", () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    // Each emitted entry must carry these fields per spec §1.
    expect(prompt).toContain('mainComponentSetId');
    expect(prompt).toContain('variantOverrides');
    expect(prompt).toContain('componentPropertyOverrides');
    expect(prompt).toContain('resolvedStyles');
    expect(prompt).toContain('path');
  });

  it('script captures Has Icon, Icon, Label overrides for INSTANCE_SWAP and TEXT props', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    // The script must keep the existing INSTANCE_SWAP resolution and capture Label/Has Icon.
    expect(prompt).toContain('INSTANCE_SWAP');
    // Property-name normalization (strip `#nodeId` suffix) is already in place; keep it.
    expect(prompt).toContain(".split('#')[0]");
  });

  it('script halts walk at depth 6 with a warning marker', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    // Surface a depth warning entry rather than silently truncating.
    expect(prompt).toContain('depthExceeded');
  });
});
