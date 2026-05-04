import type { ProjectConfig } from 'crew-shared';
import type { PreflightCheck } from './types.js';

export interface RunPreflightOptions {
  config: ProjectConfig;
  worktree: string;
  checks: PreflightCheck[];
}

export async function runPreflight(opts: RunPreflightOptions): Promise<void> {
  for (const check of opts.checks) {
    await check.run({ config: opts.config, worktree: opts.worktree });
  }
}
