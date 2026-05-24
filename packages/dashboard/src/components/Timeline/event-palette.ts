import { type ToolColorKey } from '../../data/tool-colors.js';

const TOOL_COLOR_MAP: Record<string, ToolColorKey> = {
  Bash: 'bash',
  Edit: 'edit',
  Read: 'read',
  Write: 'write',
  Grep: 'grep',
  TodoWrite: 'todoWrite',
  Task: 'task',
  'MCP:Jira': 'mcpJira',
  'MCP:Figma': 'mcpFigma',
  'MCP:Chrome': 'mcpChrome',
  'MCP:Playwright': 'mcpPlaywright',
  'MCP:Memory': 'mcpMemory',
  'MCP:Atlassian': 'mcpAtlassian',
  WebFetch: 'webNet',
  WebSearch: 'webNet',
};

export function colorForTool(aliasedName: string): ToolColorKey {
  return TOOL_COLOR_MAP[aliasedName] ?? 'default';
}
