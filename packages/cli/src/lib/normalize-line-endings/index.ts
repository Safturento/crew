import { execa } from 'execa';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot, hasUncommittedChanges, listCrlfWorkingTreeFiles } from '../git/index.js';

export type NormalizeStatus = 'dirty' | 'noop' | 'normalized';

export interface NormalizeLineEndingsDeps {
  /** A directory inside the target repo; the repo root is resolved from it. */
  cwd: string;
  log: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface NormalizeLineEndingsResult {
  status: NormalizeStatus;
  /** Populated when `status === 'dirty'`. */
  reason?: string;
  /** CRLF working-tree files before normalizing. */
  beforeCount: number;
  /** CRLF working-tree files remaining after pass 1 (checkout-index). */
  afterPass1Count: number;
  /** CRLF working-tree files remaining after both passes. */
  afterCount: number;
  /** True if `git add -u` left line-ending normalizations staged. */
  indexHasChanges: boolean;
  /** True if the working tree still differs from the index (content drift). */
  workingTreeDrift: boolean;
}

const EMPTY = {
  beforeCount: 0,
  afterPass1Count: 0,
  afterCount: 0,
  indexHasChanges: false,
  workingTreeDrift: false,
};

/** Returns true if `git <args>` exits zero (the `--quiet` "no diff" signal). */
async function diffQuiet(cwd: string, args: string[]): Promise<boolean> {
  try {
    await execa('git', args, { cwd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Strip a trailing CR from each line, mirroring the bash `sed -i 's/\r$//'`.
 * Only CRs immediately before a newline (or at end of file) are removed, so
 * lone CRs mid-line are left alone — exactly as `\r$` behaves per line in sed.
 */
function stripTrailingCr(content: string): string {
  return content.replace(/\r(?=\n|$)/g, '');
}

/**
 * Re-normalize CRLF working-tree files to LF using the repo's current
 * `.gitattributes`, then brute-force strip any CRLF that survives.
 *
 * Two passes, preserved from the Recipes `normalize-line-endings.sh`:
 *  1. `git checkout-index --all --force` rewrites every tracked file from the
 *     index, applying the current attributes' smudge filter.
 *  2. For any file still CRLF afterwards (e.g. when a global `core.autocrlf`
 *     defeats the smudge), strip `\r` directly.
 *
 * Then `git add -u` re-stats every tracked file — `writeFileSync` bumps mtime,
 * which otherwise leaves `git status` reporting clean files as modified — and
 * stages any genuine content change (the normalization the user should commit).
 *
 * Refuses to run on a dirty working tree, since `checkout-index --force` would
 * silently overwrite uncommitted changes.
 */
export async function runNormalizeLineEndings(
  deps: NormalizeLineEndingsDeps,
): Promise<NormalizeLineEndingsResult> {
  const root = await getRepoRoot(deps.cwd);

  if (await hasUncommittedChanges(root)) {
    return {
      status: 'dirty',
      reason:
        'working tree has uncommitted changes — checkout-index --force would ' +
        'silently overwrite them. Commit, stash, or discard first, then re-run.',
      ...EMPTY,
    };
  }

  const before = await listCrlfWorkingTreeFiles(root);
  if (before.length === 0) {
    deps.log('No CRLF working-tree files found. Nothing to normalize.');
    return { status: 'noop', ...EMPTY };
  }

  deps.log(`${before.length} CRLF working-tree file(s) found. Normalizing…`);

  // Pass 1 — re-checkout from the index, applying current .gitattributes.
  deps.log('pass 1: git checkout-index --all --force');
  await execa('git', ['checkout-index', '--all', '--force'], { cwd: root });
  const afterPass1 = await listCrlfWorkingTreeFiles(root);
  deps.log(`after pass 1: ${afterPass1.length} CRLF file(s) remain`);

  // Pass 2 — brute-force strip CR from whatever the smudge missed.
  if (afterPass1.length > 0) {
    deps.log(`pass 2: stripping CR from ${afterPass1.length} surviving file(s)`);
    for (const rel of afterPass1) {
      const abs = join(root, rel);
      if (!existsSync(abs)) continue;
      // utf8 round-trip is safe here: `git ls-files --eol` only reports
      // `w/crlf` for files git classifies as text, so we never touch binaries.
      const original = readFileSync(abs, 'utf8');
      const stripped = stripTrailingCr(original);
      if (stripped !== original) writeFileSync(abs, stripped);
    }
  }

  const after = await listCrlfWorkingTreeFiles(root);

  // Refresh git's stat cache and stage any real normalization.
  await execa('git', ['add', '-u'], { cwd: root });
  const indexHasChanges = !(await diffQuiet(root, ['diff', '--cached', '--quiet']));
  const workingTreeDrift = !(await diffQuiet(root, ['diff', '--quiet']));

  deps.log(`before: ${before.length} CRLF file(s)`);
  deps.log(`after:  ${after.length} CRLF file(s)`);
  if (after.length > 0) {
    deps.log('(any remaining CRLF files have explicit eol=crlf attrs — that is fine)');
  }

  if (indexHasChanges) {
    deps.log(
      'index now contains line-ending normalizations to commit:\n' +
        '  git commit -m "chore: normalize line endings to LF"',
    );
  } else if (workingTreeDrift) {
    deps.warn(
      'working tree differs from index after normalization — content drift ' +
        'beyond line endings. Inspect with: git diff',
    );
  }

  return {
    status: 'normalized',
    beforeCount: before.length,
    afterPass1Count: afterPass1.length,
    afterCount: after.length,
    indexHasChanges,
    workingTreeDrift,
  };
}
