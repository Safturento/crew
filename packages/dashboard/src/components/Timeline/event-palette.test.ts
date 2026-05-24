import { describe, expect, it } from 'vitest';

import { colorForTool } from './event-palette.js';

describe('colorForTool', () => {
  it('returns the correct ToolColorKey for known tools', () => {
    expect(colorForTool('Bash')).toBe('bash');
    expect(colorForTool('Edit')).toBe('edit');
    expect(colorForTool('Read')).toBe('read');
    expect(colorForTool('Write')).toBe('write');
    expect(colorForTool('Grep')).toBe('grep');
    expect(colorForTool('TodoWrite')).toBe('todoWrite');
    expect(colorForTool('Task')).toBe('task');
    expect(colorForTool('MCP:Jira')).toBe('mcpJira');
    expect(colorForTool('MCP:Figma')).toBe('mcpFigma');
    expect(colorForTool('MCP:Chrome')).toBe('mcpChrome');
    expect(colorForTool('MCP:Playwright')).toBe('mcpPlaywright');
    expect(colorForTool('MCP:Memory')).toBe('mcpMemory');
    expect(colorForTool('MCP:Atlassian')).toBe('mcpAtlassian');
    expect(colorForTool('WebFetch')).toBe('webNet');
    expect(colorForTool('WebSearch')).toBe('webNet');
  });

  it('MCP:Confluence shares the Atlassian vendor cluster (blue)', () => {
    expect(colorForTool('MCP:Confluence')).toBe('mcpAtlassian');
  });

  it('returns "default" for unknown tools', () => {
    expect(colorForTool('SomeFutureTool')).toBe('default');
    expect(colorForTool('')).toBe('default');
  });
});
