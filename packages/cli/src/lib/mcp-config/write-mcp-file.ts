import { execa } from 'execa';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { buildMcpConfig, type BuildMcpConfigOptions } from './build-mcp-config.js';
import { resolveSuperpowersChrome } from './resolve-superpowers-chrome.js';

const EXCLUDE_LINE = '.mcp.json';

const PLUGIN_MISSING_WARNING =
  'superpowers-chrome plugin not found in ~/.claude/plugins/cache/ — ' +
  'chrome MCP not wired; visual-fidelity Step 5 will degrade to verification-gap';

export interface WriteMcpFileResult {
  existed: boolean;
  /** Resolved chromium executable path, or null when playwright wiring was off
   *  or the path could not be resolved. */
  chromiumPath: string | null;
  /** Resolved chrome MCP server path, or null when chrome wiring was off or the
   *  superpowers-chrome plugin was not found. */
  chromeMcpPath: string | null;
}

export interface WriteMcpFileOptions {
  /** Wire the playwright MCP server. Omit to leave it out. */
  playwright?: { appUrl: string; resolverCwd: string };
  /** Wire the chrome MCP server. Omit to leave it out. `homeDir` overrides the
   *  plugin-cache lookup root (tests only; production omits it). */
  chrome?: { homeDir?: string };
  /** Warning sink for plugin-absent. Defaults to a no-op. */
  warn?: (msg: string) => void;
}

export async function writeMcpFile(
  worktreePath: string,
  opts: WriteMcpFileOptions,
): Promise<WriteMcpFileResult> {
  const mcpPath = join(worktreePath, '.mcp.json');
  const existed = existsSync(mcpPath);

  let chromiumPath: string | null = null;
  let playwrightOpts: BuildMcpConfigOptions['playwright'];
  if (opts.playwright) {
    chromiumPath = await resolveChromiumExecutablePath(opts.playwright.resolverCwd);
    playwrightOpts = {
      appUrl: opts.playwright.appUrl,
      chromiumPath: chromiumPath ?? undefined,
    };
  }

  let chromeMcpPath: string | null = null;
  let chromeOpts: BuildMcpConfigOptions['chrome'];
  if (opts.chrome) {
    const resolved = resolveSuperpowersChrome(opts.chrome.homeDir);
    if (resolved) {
      chromeMcpPath = resolved.mcpServerPath;
      chromeOpts = { mcpServerPath: resolved.mcpServerPath };
    } else {
      (opts.warn ?? (() => {}))(PLUGIN_MISSING_WARNING);
    }
  }

  const config = buildMcpConfig({ playwright: playwrightOpts, chrome: chromeOpts });
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
