import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** True iff the gh-token file exists and is non-empty. Never reads its contents. */
export function hasRepoToken(tokenPath: string): boolean {
  return existsSync(tokenPath) && statSync(tokenPath).size > 0;
}

/** The `mcpServers` map from a parsed ~/.claude.json, or {} if absent/shaped wrong. */
function extractMcpServers(parsed: unknown): Record<string, unknown> {
  if (parsed && typeof parsed === 'object' && 'mcpServers' in parsed) {
    const servers = (parsed as { mcpServers?: unknown }).mcpServers;
    if (servers && typeof servers === 'object') return servers as Record<string, unknown>;
  }
  return {};
}

/** Heuristic: does this MCP server entry target GitHub? Name- and URL-based, no secrets echoed. */
function looksLikeGithub(name: string, entry: unknown): boolean {
  if (/github/i.test(name)) return true;
  if (entry && typeof entry === 'object') {
    const url = (entry as { url?: unknown }).url;
    if (typeof url === 'string' && /github(copilot)?\.com|github\.com/i.test(url)) return true;
    const command = (entry as { command?: unknown }).command;
    const args = (entry as { args?: unknown }).args;
    const blob = `${typeof command === 'string' ? command : ''} ${Array.isArray(args) ? args.join(' ') : ''}`;
    if (/github-mcp-server|github\/github-mcp/i.test(blob)) return true;
  }
  return false;
}

/**
 * True when ~/.claude.json declares an MCP server that targets GitHub. Presence
 * check only — never validates the credential, never echoes the file (it may
 * carry an Authorization token). Malformed / missing file → false.
 */
export function userMcpHasGithubServer(homeDir: string = homedir()): boolean {
  const configPath = join(homeDir, '.claude.json');
  if (!existsSync(configPath)) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return false;
  }
  return Object.entries(extractMcpServers(parsed)).some(([name, entry]) =>
    looksLikeGithub(name, entry),
  );
}

export interface GithubAuthResolution {
  hasToken: boolean;
  hasMcp: boolean;
  ok: boolean;
}

/** Resolve which GitHub-auth channels are configured for a dispatch. */
export function resolveGithubAuth(opts: {
  tokenPath: string;
  homeDir?: string;
}): GithubAuthResolution {
  const hasToken = hasRepoToken(opts.tokenPath);
  const hasMcp = userMcpHasGithubServer(opts.homeDir);
  return { hasToken, hasMcp, ok: hasToken || hasMcp };
}

/** Throw a fail-fast error when no GitHub-auth channel is configured. */
export function requireGithubAuth(opts: { tokenPath: string; homeDir?: string }): void {
  if (resolveGithubAuth(opts).ok) return;
  throw new Error(
    `no GitHub credential configured for dispatch — the agent can't open a PR.\n` +
      `       Configure one of:\n` +
      `       • a GitHub MCP server in ~/.claude.json (preferred), or\n` +
      `       • a PAT at ${opts.tokenPath} (chmod 600).`,
  );
}
