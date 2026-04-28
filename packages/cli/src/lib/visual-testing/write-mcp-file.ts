import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMcpConfig } from './build-mcp-config.js';

export interface WriteMcpFileResult {
  existed: boolean;
}

const EXCLUDE_LINE = '.mcp.json';

export function writeMcpFile(worktreePath: string, opts: { appUrl: string }): WriteMcpFileResult {
  const mcpPath = join(worktreePath, '.mcp.json');
  const existed = existsSync(mcpPath);

  const config = buildMcpConfig({ appUrl: opts.appUrl });
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');

  appendExcludeLine(worktreePath);
  return { existed };
}

function appendExcludeLine(worktreePath: string): void {
  const excludePath = join(worktreePath, '.git', 'info', 'exclude');
  const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
  const lines = current.split('\n');
  if (lines.some((l) => l.trim() === EXCLUDE_LINE)) return;
  const next = current.endsWith('\n') || current.length === 0 ? current : current + '\n';
  writeFileSync(excludePath, next + EXCLUDE_LINE + '\n');
}
