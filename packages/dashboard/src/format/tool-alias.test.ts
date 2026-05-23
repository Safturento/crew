import { describe, expect, it } from 'vitest';

import { aggregateByAlias, toolAlias } from './tool-alias.js';

describe('toolAlias', () => {
  it('returns built-in tool names unchanged', () => {
    expect(toolAlias('Bash')).toBe('Bash');
    expect(toolAlias('Read')).toBe('Read');
    expect(toolAlias('Edit')).toBe('Edit');
    expect(toolAlias('Skill')).toBe('Skill');
    expect(toolAlias('TaskCreate')).toBe('TaskCreate');
    expect(toolAlias('ToolSearch')).toBe('ToolSearch');
  });

  it('collapses every Jira variant to MCP:Jira', () => {
    expect(toolAlias('mcp__atlassian__jira_get_issue')).toBe('MCP:Jira');
    expect(toolAlias('mcp__atlassian__jira_transition_issue')).toBe('MCP:Jira');
    expect(toolAlias('mcp__claude_ai_Atlassian_Rovo__getJiraIssue')).toBe('MCP:Jira');
    expect(toolAlias('mcp__claude_ai_Atlassian_Rovo__createJiraIssue')).toBe('MCP:Jira');
  });

  it('collapses every Confluence variant to MCP:Confluence', () => {
    expect(toolAlias('mcp__atlassian__confluence_get_page')).toBe('MCP:Confluence');
    expect(toolAlias('mcp__atlassian__confluence_create_page')).toBe('MCP:Confluence');
  });

  it('collapses every Figma variant to MCP:Figma', () => {
    expect(toolAlias('mcp__plugin_figma_figma__use_figma')).toBe('MCP:Figma');
    expect(toolAlias('mcp__figma__get_design_context')).toBe('MCP:Figma');
    expect(toolAlias('mcp__figma-desktop__get_design_context')).toBe('MCP:Figma');
  });

  it('collapses Playwright tools to MCP:Playwright', () => {
    expect(toolAlias('mcp__playwright__browser_navigate')).toBe('MCP:Playwright');
    expect(toolAlias('mcp__playwright__browser_take_screenshot')).toBe('MCP:Playwright');
  });

  it('collapses Chrome tools to MCP:Chrome', () => {
    expect(toolAlias('mcp__plugin_superpowers-chrome_chrome__use_browser')).toBe('MCP:Chrome');
    expect(toolAlias('mcp__chrome__use_browser')).toBe('MCP:Chrome');
  });

  it('collapses claude-mem tools to MCP:Memory', () => {
    expect(toolAlias('mcp__plugin_claude-mem_mcp-search__search')).toBe('MCP:Memory');
    expect(toolAlias('mcp__plugin_claude-mem_mcp-search__timeline')).toBe('MCP:Memory');
  });

  it('collapses non-Jira Atlassian ops to MCP:Atlassian', () => {
    expect(toolAlias('mcp__claude_ai_Atlassian_Rovo__getAccessibleAtlassianResources')).toBe(
      'MCP:Atlassian',
    );
  });

  it('derives a friendly fallback bucket for an unknown MCP', () => {
    expect(toolAlias('mcp__plugin_newservice__do_thing')).toBe('MCP:Newservice');
  });

  it('falls back to MCP:Unknown when the server segment is empty', () => {
    expect(toolAlias('mcp__')).toBe('MCP:Unknown');
  });
});

describe('aggregateByAlias', () => {
  it('preserves built-in tool rows verbatim', () => {
    const rows = [
      { tool: 'Bash', tokens: 100 },
      { tool: 'Edit', tokens: 50 },
    ];
    expect(aggregateByAlias(rows)).toEqual([
      { alias: 'Bash', tokens: 100, raw: ['Bash'] },
      { alias: 'Edit', tokens: 50, raw: ['Edit'] },
    ]);
  });

  it('collapses MCP rows into a single alias with summed tokens and raw contributors', () => {
    const rows = [
      { tool: 'mcp__atlassian__jira_get_issue', tokens: 200 },
      { tool: 'mcp__atlassian__jira_transition_issue', tokens: 50 },
      { tool: 'mcp__plugin_figma_figma__use_figma', tokens: 300 },
      { tool: 'Bash', tokens: 1_000 },
    ];
    const out = aggregateByAlias(rows);
    expect(out).toEqual([
      { alias: 'Bash', tokens: 1_000, raw: ['Bash'] },
      { alias: 'MCP:Figma', tokens: 300, raw: ['mcp__plugin_figma_figma__use_figma'] },
      {
        alias: 'MCP:Jira',
        tokens: 250,
        raw: ['mcp__atlassian__jira_get_issue', 'mcp__atlassian__jira_transition_issue'],
      },
    ]);
  });

  it('sorts the aggregated output by tokens descending', () => {
    const rows = [
      { tool: 'A', tokens: 10 },
      { tool: 'B', tokens: 100 },
      { tool: 'C', tokens: 50 },
    ];
    expect(aggregateByAlias(rows).map((r) => r.alias)).toEqual(['B', 'C', 'A']);
  });

  it('returns an empty array for empty input', () => {
    expect(aggregateByAlias([])).toEqual([]);
  });
});
