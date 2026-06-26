import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scaffoldGhToken } from '../../init/scaffold-gh-token.js';
import { fail, ok, type HealthCheck } from '../types.js';

/** The per-repo gh-token path, relative to the context worktree. */
const GH_TOKEN_REL = join('.claude', 'secrets', 'gh-token');

/**
 * Require a populated gh-token secret at `<worktree>/.claude/secrets/gh-token`.
 *
 * `fail` when the file is missing or empty (`!exists || size === 0`). As of
 * CREW-297 the run-path fast gate is `requireGithubAuth` (`lib/github-auth/`),
 * which clears on a per-repo token **or** a user-level GitHub MCP server — so
 * its condition intentionally diverges from this token-only check: a token-less
 * MCP machine passes the run-path gate while this check still flags. Broadening
 * this check to the same OR-logic is the rest of Epic CREW-296.
 *
 * `fix()` is **limited**: it scaffolds the empty `0600` placeholder + the
 * `.claude/secrets/` gitignore entry (via the shared `scaffoldGhToken`), but the
 * check **stays red** until a real token is pasted — a `fix()` can't supply a
 * secret. The `crew doctor --fix` report therefore still shows this `fail` after
 * the fix pass; that is by design, not a no-op bug.
 *
 * Secret-safe: never reads the token's contents (only `existsSync` +
 * `statSync().size`), never writes a real token, never echoes it.
 */
export const ghTokenPresent: HealthCheck = {
  name: 'gh-token-present',
  scope: 'project',
  detect: async ({ worktree }) => {
    const tokenPath = join(worktree, GH_TOKEN_REL);

    if (existsSync(tokenPath) && statSync(tokenPath).size > 0) {
      return ok('gh-token present');
    }

    return fail('gh-token missing or empty — dispatch can’t authorize GitHub', {
      remediation: `paste a GitHub PAT (Contents + Pull-requests read/write on the repo) at ${tokenPath}`,
      // fix() scaffolds the path/perms/gitignore, but the check stays red until a
      // real token is present — fix can't supply the secret.
      fixable: true,
      details: { expected: tokenPath },
    });
  },
  fix: async ({ worktree }) => {
    scaffoldGhToken(worktree);
  },
};
