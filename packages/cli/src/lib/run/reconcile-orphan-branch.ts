import { execa } from 'execa';

export interface ReconcileOrphanBranchOptions {
  /** Source repo the worktree branches off — every git call runs here. */
  repoPath: string;
  /** Ticket key, which is also the worktree branch name. */
  key: string;
  /** Project default branch (e.g. 'main'); its `origin/<default>` ref is the
   * baseline the branch's unique commits are counted against. */
  defaultBranch: string;
  /** Optional env (PATH) handed to each git subprocess. */
  env?: NodeJS.ProcessEnv;
}

export type ReconcileOrphanBranchResult =
  | { action: 'none' } // no `<key>` branch existed — nothing to do
  | { action: 'reclaimed' }; // a safe orphan was deleted so the worktree add can recreate it

/**
 * Make `git worktree add -b <key>` idempotent against an orphan branch (CREW-287).
 *
 * `crew run` always creates its worktree with a fresh `-b <key>` branch off
 * `origin/<default>`. If a `<key>` branch already exists — left behind by a run
 * interrupted after branch creation but before completion (crash, kill, or a
 * `git worktree remove` that didn't also `git branch -D`) — that `-b` hard-fails
 * with `fatal: a branch named '<key>' already exists`, wedging *every* later run
 * of that key.
 *
 * Run this after `git fetch origin <default>` and before the worktree add. It
 * distinguishes a **safe orphan** — a `<key>` branch with no commits beyond
 * `origin/<default>` — which it deletes so the add recreates it cleanly, from a
 * branch carrying **unrecovered work** (unique commits), which it refuses to
 * touch, throwing an actionable error instead of letting the raw git fatal
 * surface. When the unique-commit count can't be computed (e.g. the origin ref
 * is missing) it also refuses rather than risk deleting real work.
 */
export async function reconcileOrphanBranch(
  opts: ReconcileOrphanBranchOptions,
): Promise<ReconcileOrphanBranchResult> {
  const cwd = opts.repoPath;
  const env = opts.env;

  const showRef = await execa(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/heads/${opts.key}`],
    { cwd, env, reject: false },
  );
  if (showRef.exitCode !== 0) return { action: 'none' };

  // Commits on <key> not reachable from origin/<default>. A safe orphan has 0:
  // its tip is at (or behind) the default branch, so deleting it loses nothing.
  const revList = await execa(
    'git',
    ['rev-list', '--count', `origin/${opts.defaultBranch}..refs/heads/${opts.key}`],
    { cwd, env, reject: false },
  );
  // Refuse on any uncertainty — a non-zero exit (e.g. missing origin ref) OR a
  // clean exit whose output isn't an integer. Erring toward keeping the branch
  // is the safe default: a wrong "0" here would delete unrecovered work.
  const rawCount = revList.stdout.trim();
  const uniqueCommits = Number.parseInt(rawCount, 10);
  if (revList.exitCode !== 0 || !Number.isFinite(uniqueCommits)) {
    const detail =
      revList.stderr.trim() ||
      `git rev-list rc=${revList.exitCode}, output ${JSON.stringify(rawCount)}`;
    throw new Error(
      `branch ${opts.key} already exists, but its commits relative to ` +
        `origin/${opts.defaultBranch} could not be determined (${detail}) — refusing to delete it.\n` +
        `       Inspect and remove it manually if it is safe to discard:  git -C ${cwd} branch -D ${opts.key}`,
    );
  }

  if (uniqueCommits > 0) {
    throw new Error(
      `branch ${opts.key} already exists with ${uniqueCommits} unpushed commit(s) not on ` +
        `origin/${opts.defaultBranch} — refusing to delete it. This is unrecovered work from an ` +
        `earlier interrupted run. Inspect it, then choose:\n` +
        `       • Keep it:     git -C ${cwd} log origin/${opts.defaultBranch}..${opts.key}\n` +
        `       • Discard it:  git -C ${cwd} branch -D ${opts.key}   (then re-run crew run ${opts.key})`,
    );
  }

  // Safe orphan: delete so `git worktree add -b <key>` recreates it from
  // origin/<default>. `-D` (force) is safe — the zero-unique-commits check
  // above already proved there is nothing to lose; `-d` would needlessly refuse
  // on "not fully merged" when no upstream is configured.
  const del = await execa('git', ['branch', '-D', opts.key], { cwd, env, reject: false });
  if (del.exitCode !== 0) {
    throw new Error(
      `branch ${opts.key} exists but could not be removed: ` +
        `${del.stderr.trim() || `git branch -D rc=${del.exitCode}`}\n` +
        `       It may be checked out in another worktree — run \`git -C ${cwd} worktree list\` to find it.`,
    );
  }

  return { action: 'reclaimed' };
}

export type ReconcileOrphanWorktreeResult =
  | 'absent' // no worktree currently holds the `<key>` branch — nothing to do
  | 'reclaimed'; // a safe orphan worktree was removed so the add can recreate it

/**
 * Make `git worktree add <path>` idempotent against an orphan worktree
 * directory (CREW-309) — the sibling of {@link reconcileOrphanBranch}, extended
 * from a leftover *branch* to a leftover *worktree directory*.
 *
 * A run interrupted after its worktree was created but before completion (crash,
 * kill, a partial cleanup) leaves the `<key>` worktree registered and checked
 * out. On the next `crew run <key>`, `requireWorktreeAvailable` throws on the
 * lingering directory and every re-run of that key is wedged until it's removed
 * by hand (`crew restart <key> --hard`).
 *
 * Run this in preflight, after `git fetch origin <default>` and before
 * `requireWorktreeAvailable`, so the common wedge self-heals. It distinguishes a
 * **safe orphan** — a worktree whose `<key>` branch has no commits beyond
 * `origin/<default>` — which it removes so the run can recreate it cleanly, from
 * one carrying **unrecovered work** (unique commits), which it refuses to touch,
 * throwing an actionable error. When the unique-commit count can't be computed
 * (e.g. the origin ref is missing) it also refuses rather than risk discarding
 * real work — mirroring `reconcileOrphanBranch`'s "refuse on any uncertainty".
 *
 * Only the worktree directory is removed here; the `<key>` branch it held is
 * left in place (now unchecked-out) for `reconcileOrphanBranch` — which runs
 * next, in the worktree bracket — to reclaim. The two compose: worktree reclaim
 * → branch reclaim → `git worktree add -b <key>`.
 */
export async function reconcileOrphanWorktree(
  opts: ReconcileOrphanBranchOptions,
): Promise<ReconcileOrphanWorktreeResult> {
  const cwd = opts.repoPath;
  const env = opts.env;

  // Find the worktree (if any) currently checked out on the `<key>` branch.
  // Keying off the branch — rather than the conventional on-disk path — finds
  // the orphan wherever it lives and confirms it is holding our branch.
  const list = await execa('git', ['worktree', 'list', '--porcelain'], { cwd, env, reject: false });
  const worktreePath = worktreePathForBranch(list.stdout, opts.key);
  if (worktreePath === null) return 'absent';

  // Commits on <key> not reachable from origin/<default>. A safe orphan has 0.
  const revList = await execa(
    'git',
    ['rev-list', '--count', `origin/${opts.defaultBranch}..refs/heads/${opts.key}`],
    { cwd, env, reject: false },
  );
  // Refuse on any uncertainty — a non-zero exit (e.g. missing origin ref) OR a
  // clean exit whose output isn't an integer. Erring toward keeping the worktree
  // is the safe default: a wrong "0" here would discard unrecovered work.
  const rawCount = revList.stdout.trim();
  const uniqueCommits = Number.parseInt(rawCount, 10);
  if (revList.exitCode !== 0 || !Number.isFinite(uniqueCommits)) {
    const detail =
      revList.stderr.trim() ||
      `git rev-list rc=${revList.exitCode}, output ${JSON.stringify(rawCount)}`;
    throw new Error(
      `worktree for ${opts.key} at ${worktreePath} already exists, but its commits relative to ` +
        `origin/${opts.defaultBranch} could not be determined (${detail}) — refusing to delete it.\n` +
        `       Inspect and remove it manually if it is safe to discard:  ` +
        `git -C ${cwd} worktree remove --force ${worktreePath}`,
    );
  }

  if (uniqueCommits > 0) {
    throw new Error(
      `worktree for ${opts.key} at ${worktreePath} already exists with ${uniqueCommits} unpushed ` +
        `commit(s) not on origin/${opts.defaultBranch} — refusing to delete it. This is unrecovered ` +
        `work from an earlier interrupted run. Inspect it, then choose:\n` +
        `       • Keep it:     git -C ${cwd} log origin/${opts.defaultBranch}..${opts.key}\n` +
        `       • Discard it:  git -C ${cwd} worktree remove --force ${worktreePath}   ` +
        `(then re-run crew run ${opts.key})`,
    );
  }

  // Safe orphan: remove so `git worktree add` recreates it from origin/<default>.
  // `--force` is safe — the zero-unique-commits check above already proved there
  // is nothing to lose. This leaves the `<key>` branch behind for
  // reconcileOrphanBranch to reclaim next.
  const remove = await execa('git', ['worktree', 'remove', '--force', worktreePath], {
    cwd,
    env,
    reject: false,
  });
  if (remove.exitCode !== 0) {
    throw new Error(
      `worktree for ${opts.key} at ${worktreePath} exists but could not be removed: ` +
        `${remove.stderr.trim() || `git worktree remove rc=${remove.exitCode}`}\n` +
        `       Inspect it manually:  git -C ${cwd} worktree list`,
    );
  }

  return 'reclaimed';
}

/**
 * Parse `git worktree list --porcelain` and return the path of the worktree
 * checked out on `refs/heads/<key>`, or null if none holds that branch. The
 * porcelain format is newline-delimited records separated by blank lines; each
 * record opens with a `worktree <path>` line and (unless detached) carries a
 * `branch <ref>` line.
 */
function worktreePathForBranch(porcelain: string, key: string): string | null {
  const target = `refs/heads/${key}`;
  let currentPath: string | null = null;
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length).trim();
    } else if (line.startsWith('branch ')) {
      if (line.slice('branch '.length).trim() === target && currentPath) return currentPath;
    }
  }
  return null;
}
