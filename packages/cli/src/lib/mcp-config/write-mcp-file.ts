import { execa } from 'execa';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { buildMcpConfig } from './build-mcp-config.js';
import { resolveChromeMcpPath } from './resolve-chrome-mcp-path.js';

const EXCLUDE_LINE = '.mcp.json';

export interface PlaywrightWriteOptions {
  appUrl: string;
  resolverCwd: string;
}

export interface WriteMcpFileOptions {
  playwright?: PlaywrightWriteOptions;
  // When true, attempt to resolve the superpowers-chrome MCP server from the
  // user's plugin cache and write a chrome server entry alongside playwright.
  // If resolution fails the entry is omitted (with a warning via `warn`) and
  // the dispatch continues — chrome MCP is optional.
  chrome?: boolean;
  // Override homedir for tests. Resolved via `resolveChromeMcpPath`.
  home?: string;
  // Logger invoked when chrome was requested but couldn't be resolved.
  // Defaults to no-op so callers can inject `pc.yellow`-formatted output
  // without forcing every caller to do so.
  warn?: (msg: string) => void;
}

export interface WriteMcpFileResult {
  existed: boolean;
  chromiumPath: string | null;
  chromeMcpPath: string | null;
}

export async function writeMcpFile(
  worktreePath: string,
  opts: WriteMcpFileOptions,
): Promise<WriteMcpFileResult> {
  if (!opts.playwright && !opts.chrome) {
    throw new Error('writeMcpFile: at least one of playwright or chrome must be provided');
  }
  const mcpPath = join(worktreePath, '.mcp.json');
  const existed = existsSync(mcpPath);

  let chromiumPath: string | null = null;
  if (opts.playwright) {
    chromiumPath = await resolveChromiumExecutablePath(opts.playwright.resolverCwd);
  }

  let chromeMcpPath: string | null = null;
  if (opts.chrome) {
    chromeMcpPath = resolveChromeMcpPath(opts.home);
    if (chromeMcpPath === null && opts.warn) {
      opts.warn(
        'superpowers-chrome plugin not found in ~/.claude/plugins/cache/ — chrome MCP not wired; visual-fidelity Step 5 will degrade to verification-gap',
      );
    }
  }

  // If the only server requested was chrome and chrome failed to resolve,
  // there's nothing to write — skip the file entirely. The dispatched agent
  // runs without any MCP wired and the visual-fidelity skill logs a gap.
  const haveAnyServer = Boolean(opts.playwright) || chromeMcpPath !== null;
  if (!haveAnyServer) {
    return { existed, chromiumPath, chromeMcpPath };
  }

  const config = buildMcpConfig({
    playwright: opts.playwright
      ? { appUrl: opts.playwright.appUrl, chromiumPath: chromiumPath ?? undefined }
      : undefined,
    chrome: chromeMcpPath ? { mcpServerPath: chromeMcpPath } : undefined,
  });

  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
  await appendExcludeLine(worktreePath);
  return { existed, chromiumPath, chromeMcpPath };
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
