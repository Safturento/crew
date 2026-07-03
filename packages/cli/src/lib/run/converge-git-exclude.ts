import { execa } from 'execa';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * The three dispatch-injected `.claude/` artifacts, as `.git/info/exclude`
 * (gitignore-syntax) patterns relative to the repo root:
 *
 *  - `.claude/skills/`            — {@link runSkillInjection}, every dispatch
 *  - `.claude/crew-hooks/`        — the copied hook script (CREW-314)
 *  - `.claude/settings.local.json`— the per-dispatch `CREW_AGENT_KEY` hook (CREW-256)
 *
 * All three are deliberately untracked so they survive the `crew fix-pr` resume
 * rebase. That "never dirties the worktree" guarantee only holds when the target
 * repo gitignores `.claude/` — the crew repo does, but a non-crew target
 * (Recipes, home-assistant, …) only ignores `.claude/secrets/`. Excluding them
 * here makes the guarantee real on every target regardless of its `.gitignore`.
 */
export const DISPATCH_EXCLUDE_ENTRIES = [
  '.claude/skills/',
  '.claude/crew-hooks/',
  '.claude/settings.local.json',
] as const;

export interface ConvergeGitExcludeOptions {
  /** The dispatched worktree whose injected `.claude/` artifacts to exclude. */
  worktree: string;
  log: (msg: string) => void;
  warn: (msg: string) => void;
  /** Optional env (PATH) handed to the git subprocess. */
  env?: NodeJS.ProcessEnv;
}

export type ConvergeGitExcludeResult =
  | { kind: 'converged'; excludePath: string; added: readonly string[] }
  | { kind: 'warning'; reason: string };

/**
 * Append the {@link DISPATCH_EXCLUDE_ENTRIES} to the target repo's
 * `info/exclude`, so the dispatch-injected `.claude/` artifacts are treated as
 * untracked on every target — not just repos that gitignore `.claude/`. This
 * fixes both symptoms of the CREW-315 leak at the source: `crew finish`'s dirty
 * gate (`git status --porcelain`) stops counting the artifacts, and an agent's
 * stray `git add -A` no longer sweeps the per-dispatch-key `settings.local.json`
 * into its PR.
 *
 * The exclude file is resolved via `git rev-parse --git-common-dir` (NOT
 * `--git-dir`): for a linked worktree `--git-dir` points at
 * `.git/worktrees/<name>`, but `info/exclude` lives in the **shared** common git
 * dir, so one append covers all current and future worktrees of that repo —
 * retroactively un-dirtying already-dispatched ones. The command's relative
 * output is resolved against the worktree cwd.
 *
 * Idempotent and non-destructive: only entries not already present are appended
 * (dedup-aware, so a re-dispatch adds nothing), an existing exclude file's
 * content is preserved (append-merge), and a missing `info/` dir is created. A
 * crew-repo dispatch (already `.claude/*`-gitignored) is unaffected — the extra
 * exclude lines are a harmless no-op there.
 *
 * Best-effort: a git or filesystem failure returns a `warning` rather than
 * throwing, so a converge miss never aborts an otherwise-healthy dispatch (the
 * artifacts merely stay visible-untracked, as before this fix).
 */
export async function convergeGitExclude(
  opts: ConvergeGitExcludeOptions,
): Promise<ConvergeGitExcludeResult> {
  const { worktree, log, warn, env } = opts;

  const revParse = await execa('git', ['rev-parse', '--git-common-dir'], {
    cwd: worktree,
    env,
    reject: false,
  });
  if (revParse.exitCode !== 0) {
    const reason = revParse.stderr.trim() || `git rev-parse rc=${revParse.exitCode}`;
    warn(`converge-git-exclude: could not resolve --git-common-dir (${reason})`);
    return { kind: 'warning', reason };
  }

  // `--git-common-dir` may be relative to the cwd (the worktree); resolve it.
  const commonDir = resolve(worktree, revParse.stdout.trim());
  const excludePath = join(commonDir, 'info', 'exclude');

  try {
    const existing = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
    const lines = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
    const missing = DISPATCH_EXCLUDE_ENTRIES.filter((entry) => !lines.has(entry));

    if (missing.length === 0) {
      return { kind: 'converged', excludePath, added: [] };
    }

    // Tolerate a missing `info/` dir (a fresh clone, or a linked worktree whose
    // common git dir has never had one written).
    mkdirSync(dirname(excludePath), { recursive: true });

    const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    writeFileSync(excludePath, `${existing}${sep}${missing.join('\n')}\n`, 'utf8');
    log(`converge-git-exclude: excluded ${missing.join(', ')} → ${excludePath}`);
    return { kind: 'converged', excludePath, added: missing };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    warn(`converge-git-exclude: failed to write ${excludePath} — ${reason}`);
    return { kind: 'warning', reason };
  }
}
