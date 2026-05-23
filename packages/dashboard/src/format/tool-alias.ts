/**
 * Collapse MCP tool names into `MCP:<Service>` buckets. Built-in tool
 * names (no `mcp__` prefix) pass through unchanged.
 */
export function toolAlias(raw: string): string {
  if (!raw.startsWith('mcp__')) return raw;

  const lowered = raw.toLowerCase();
  if (lowered.includes('jira')) return 'MCP:Jira';
  if (lowered.includes('confluence')) return 'MCP:Confluence';
  if (lowered.includes('figma')) return 'MCP:Figma';
  if (lowered.includes('chrome')) return 'MCP:Chrome';
  if (lowered.includes('playwright')) return 'MCP:Playwright';
  if (lowered.includes('claude-mem') || lowered.includes('mcp-search')) return 'MCP:Memory';
  if (lowered.includes('atlassian')) return 'MCP:Atlassian';

  const [, serverRaw = ''] = raw.split('__');
  const cleaned = serverRaw
    .replace(/^plugin_/, '')
    .replace(/^claude_ai_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return `MCP:${cleaned || 'Unknown'}`;
}

export interface AliasAggregateRow {
  alias: string;
  tokens: number;
  /** Raw tool names that contributed to this alias bucket. */
  raw: string[];
}

/**
 * Sum token counts by alias bucket and sort descending. Each output row
 * carries the raw tool names that contributed so the UI can surface them
 * (e.g. as the row's hover/title text).
 */
export function aggregateByAlias(
  rows: ReadonlyArray<{ tool: string; tokens: number }>,
): AliasAggregateRow[] {
  const byAlias = new Map<string, AliasAggregateRow>();
  for (const row of rows) {
    const alias = toolAlias(row.tool);
    const existing = byAlias.get(alias);
    if (existing) {
      existing.tokens += row.tokens;
      existing.raw.push(row.tool);
    } else {
      byAlias.set(alias, { alias, tokens: row.tokens, raw: [row.tool] });
    }
  }
  return [...byAlias.values()].sort((a, b) => b.tokens - a.tokens);
}
