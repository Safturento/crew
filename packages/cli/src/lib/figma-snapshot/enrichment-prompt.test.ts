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
