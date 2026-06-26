import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The per-repo gh-token secret path, relative to the repo root. */
const GH_TOKEN_REL = join('.claude', 'secrets', 'gh-token');

/** The line `crew init` appends to the project `.gitignore`. */
export const GH_TOKEN_GITIGNORE_ENTRY = '.claude/secrets/';

export interface GhTokenScaffold {
  /** Paths created or modified this run (for `InitResult.written`). */
  written: string[];
  /** Absolute path to the gh-token placeholder. */
  tokenPath: string;
  /**
   * `true` when the placeholder is still empty (freshly created, or an existing
   * 0-byte file) — i.e. no per-repo PAT is staged. Informational only: as of
   * Epic CREW-296 dispatch is authorized by a GitHub MCP **or** this token
   * (`requireGithubAuth`), so an empty token is no longer blocking on its own.
   */
  needsToken: boolean;
}

/**
 * Append `.claude/secrets/` to `<repoDir>/.gitignore` exactly once, creating the
 * file if absent and append-merging otherwise (never clobbering a baseline
 * `.gitignore`). Returns `true` when the file was created or modified. A
 * trailing-slash-less `.claude/secrets` line counts as already-ignored.
 */
function appendGitignoreEntry(repoDir: string): boolean {
  const gitignorePath = join(repoDir, '.gitignore');
  const bare = GH_TOKEN_GITIGNORE_ENTRY.replace(/\/$/, '');

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf8');
    const lines = content.split(/\r?\n/).map((l) => l.trim());
    if (lines.includes(GH_TOKEN_GITIGNORE_ENTRY) || lines.includes(bare)) {
      return false; // already ignored — idempotent no-op
    }
    const sep = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    writeFileSync(gitignorePath, `${content}${sep}${GH_TOKEN_GITIGNORE_ENTRY}\n`, 'utf8');
    return true;
  }

  writeFileSync(gitignorePath, `${GH_TOKEN_GITIGNORE_ENTRY}\n`, 'utf8');
  return true;
}

/**
 * Scaffold the per-repo gh-token secret path and its gitignore entry. Idempotent
 * and never destructive:
 *
 *  - creates `<repoDir>/.claude/secrets/gh-token` as an **empty** file (mode
 *    `0600`) only when absent — an existing token (real or placeholder) is left
 *    untouched;
 *  - appends `.claude/secrets/` to `<repoDir>/.gitignore` exactly once.
 *
 * Secret-safe: never writes a real token and never echoes file contents. The
 * empty placeholder is an *optional* fallback slot, not a blocking requirement:
 * dispatch is authorized by a user-level GitHub MCP **or** this per-repo token
 * (the run-path `requireGithubAuth` gate, `lib/github-auth/`, CREW-297). `fix()`
 * / `init` scaffold the path but can't supply the secret.
 *
 * Mirrors `scaffoldBruno`/`scaffoldPlaywright`: a single-source scaffolder shared
 * by `crew init` (`run-init.ts`) and the `github-auth-present` health-check `fix()`.
 *
 * @param repoDir the repo root to scaffold into
 */
export function scaffoldGhToken(repoDir: string): GhTokenScaffold {
  const written: string[] = [];
  const tokenPath = join(repoDir, GH_TOKEN_REL);

  if (!existsSync(tokenPath)) {
    mkdirSync(dirname(tokenPath), { recursive: true });
    writeFileSync(tokenPath, '', { mode: 0o600 });
    // Enforce perms even if the process umask masked the create-mode bits.
    chmodSync(tokenPath, 0o600);
    written.push(tokenPath);
  }

  if (appendGitignoreEntry(repoDir)) {
    written.push(join(repoDir, '.gitignore'));
  }

  const needsToken = !existsSync(tokenPath) || statSync(tokenPath).size === 0;
  return { written, tokenPath, needsToken };
}
