import { join } from 'node:path';
import { resolveGithubAuth } from '../../github-auth/index.js';
import { scaffoldGhToken } from '../../init/scaffold-gh-token.js';
import { fail, ok, type HealthCheck } from '../types.js';

/** The per-repo gh-token path, relative to the context worktree. */
const GH_TOKEN_REL = join('.claude', 'secrets', 'gh-token');

/**
 * Dispatch is GitHub-authorized when EITHER a per-repo gh-token is present at
 * `<worktree>/.claude/secrets/gh-token` OR a GitHub MCP server is configured at
 * user level (`~/.claude.json`). This mirrors the run-path `requireGithubAuth`
 * gate (`lib/github-auth/`, CREW-297) — the two now agree, where the old
 * `gh-token-present` check intentionally diverged (token-only). Presence only:
 * never validates either credential, never echoes token contents or the MCP
 * config (it may carry an `Authorization` token).
 *
 * `fix()` scaffolds the *optional* token slot (path/perms/gitignore via the
 * shared `scaffoldGhToken`); it can't supply a credential, so a fully
 * unconfigured machine (no MCP, no token) stays red after the fix pass — by
 * design, not a no-op bug. A machine with a GitHub MCP is already `ok` and never
 * reaches `fix()`.
 */
export const githubAuthPresent: HealthCheck = {
  name: 'github-auth-present',
  scope: 'project',
  detect: async ({ worktree, homeDir }) => {
    const tokenPath = join(worktree, GH_TOKEN_REL);
    const res = resolveGithubAuth({ tokenPath, homeDir });

    if (res.ok) {
      const via = res.hasMcp && res.hasToken ? 'MCP + token' : res.hasMcp ? 'MCP' : 'token';
      return ok(`GitHub auth present (${via})`);
    }

    return fail('no GitHub auth — dispatch can’t open a PR (no MCP, no token)', {
      remediation:
        `configure a GitHub MCP server in ~/.claude.json (preferred), ` +
        `or paste a PAT at ${tokenPath} (chmod 600)`,
      // fix() scaffolds the path/perms/gitignore, but the check stays red until a
      // credential exists — fix can't supply one.
      fixable: true,
      details: { tokenPath },
    });
  },
  fix: async ({ worktree }) => {
    scaffoldGhToken(worktree);
  },
};
