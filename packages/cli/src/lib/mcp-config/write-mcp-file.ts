import { execa } from 'execa';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { buildMcpConfig } from './build-mcp-config.js';

const EXCLUDE_LINE = '.mcp.json';

export interface WriteMcpFileResult {
  existed: boolean;
  chromiumPath: string | null;
}

export async function writeMcpFile(
  worktreePath: string,
  opts: { appUrl: string; resolverCwd: string },
): Promise<WriteMcpFileResult> {
  const mcpPath = join(worktreePath, '.mcp.json');
  const existed = existsSync(mcpPath);

  const chromiumPath = await resolveChromiumExecutablePath(opts.resolverCwd);
  const config = buildMcpConfig({
    playwright: {
      appUrl: opts.appUrl,
      chromiumPath: chromiumPath ?? undefined,
    },
  });
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');

  await appendExcludeLine(worktreePath);
  return { existed, chromiumPath };
}

// Ask `@playwright/test` (resolved against `resolverCwd`) which chromium
// binary it would launch. Returns null when the package isn't installed
// from that cwd, or when the resolved path doesn't exist on disk — caller
// falls back to the default MCP behavior (system chrome channel).
//
// Callers pass `config.repo_path` here, not the worktree path: crew creates
// worktrees as bare `git worktree add` checkouts with no `node_modules`,
// so resolving from there always fails. The chromium binary lives in the
// user-shared `~/.cache/ms-playwright/`, identical for both, so resolving
// from the host repo (which the user has installed) produces the same path
// the worktree would once it had `node_modules`.
async function resolveChromiumExecutablePath(resolverCwd: string): Promise<string | null> {
  const result = await execa(
    'node',
    ['-e', 'console.log(require("@playwright/test").chromium.executablePath())'],
    { cwd: resolverCwd, reject: false },
  );
  if (result.exitCode !== 0) return null;
  const path = result.stdout.trim();
  if (!path || !existsSync(path)) return null;
  return path;
}

async function appendExcludeLine(worktreePath: string): Promise<void> {
  const result = await execa('git', ['rev-parse', '--git-common-dir'], {
    cwd: worktreePath,
    reject: false,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `appendExcludeLine: git rev-parse --git-common-dir failed in ${worktreePath} (rc=${result.exitCode}): ${result.stderr}`,
    );
  }
  const rawCommonDir = result.stdout.trim();
  const commonDir = isAbsolute(rawCommonDir) ? rawCommonDir : join(worktreePath, rawCommonDir);
  const excludePath = join(commonDir, 'info', 'exclude');

  const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
  const lines = current.split('\n');
  if (lines.some((l) => l.trim() === EXCLUDE_LINE)) return;
  const next = current.endsWith('\n') || current.length === 0 ? current : current + '\n';
  writeFileSync(excludePath, next + EXCLUDE_LINE + '\n');
}
