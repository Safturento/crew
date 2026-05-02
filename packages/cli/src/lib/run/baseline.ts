import { execa } from 'execa';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface CheckE2eBaselineOptions {
  projectName: string;
  repoPath: string;
  defaultBranch: string;
  /** Override cache root for tests; production code uses `~/.cache/crew/baselines`. */
  cacheRoot?: string;
}

export type BaselineCheckResult =
  | { green: true; sha: string }
  | {
      green: false;
      reason: 'no-record' | 'mismatch' | 'no-ref';
      actualSha?: string;
      recordedSha?: string;
      cachePath: string;
    };

function defaultCacheRoot(): string {
  return join(homedir(), '.cache', 'crew', 'baselines');
}

export function baselineCachePathFor(projectName: string, cacheRoot?: string): string {
  return join(cacheRoot ?? defaultCacheRoot(), projectName);
}

/**
 * Checks the project's last-known-green e2e baseline against the current
 * `origin/<default_branch>` SHA. The handshake is explicit: a one-line cache
 * file at `~/.cache/crew/baselines/<project>` contains the SHA the human last
 * confirmed e2e was green at; this function compares it to the live remote
 * tip. The baseline gate enables only on `green: true`.
 */
export async function checkE2eBaseline(
  opts: CheckE2eBaselineOptions,
): Promise<BaselineCheckResult> {
  const cachePath = baselineCachePathFor(opts.projectName, opts.cacheRoot);

  const ref = `refs/remotes/origin/${opts.defaultBranch}`;
  const result = await execa('git', ['-C', opts.repoPath, 'rev-parse', '--verify', ref], {
    reject: false,
  });
  if (result.exitCode !== 0) {
    return { green: false, reason: 'no-ref', cachePath };
  }
  const actualSha = result.stdout.trim();

  if (!existsSync(cachePath)) {
    return { green: false, reason: 'no-record', actualSha, cachePath };
  }

  const recordedSha = readFileSync(cachePath, 'utf8').trim();
  if (recordedSha !== actualSha) {
    return { green: false, reason: 'mismatch', actualSha, recordedSha, cachePath };
  }

  return { green: true, sha: actualSha };
}
