import type { ProjectConfig } from 'crew-shared';
import type { DockerPorts } from '../mcp-config/index.js';
import { checksFor } from '../health/registry.js';
import { runHealth } from '../health/run-health.js';
import type { HealthCheck, HealthContext } from '../health/types.js';
import { PreflightError } from './types.js';

export interface RunPreflightOptions {
  config: ProjectConfig;
  worktree: string;
  /** Resolved docker port map (only present in fresh-mode dispatch). */
  dockerPorts?: DockerPorts;
  /** Materialized env vars from env.toml (only present for env.toml projects). */
  envVars?: Record<string, string>;
  /** Override the checks run — defaults to the registry's project-scope set. Test seam. */
  checks?: HealthCheck[];
}

/**
 * Dispatch gate: the fail-fast adapter over the shared `lib/health` registry.
 *
 * Runs the project-scope checks (collect-all via `runHealth`), then throws a
 * `PreflightError` for the first `fail` so `run`/`resume`/`fix-pr` render the
 * structured remediation and abort. `warn` and `ok` do not gate dispatch. This
 * preserves the former hand-rolled gate's behavior while defining "healthy"
 * once, shared with `crew doctor`.
 */
export async function runPreflight(opts: RunPreflightOptions): Promise<void> {
  const checks = opts.checks ?? checksFor('project');
  const ctx: HealthContext = {
    config: opts.config,
    worktree: opts.worktree,
    dockerPorts: opts.dockerPorts,
    envVars: opts.envVars,
  };

  const outcomes = await runHealth(checks, ctx);
  const firstFail = outcomes.find((o) => o.result.status === 'fail');
  if (firstFail) {
    const { check, result } = firstFail;
    throw new PreflightError(
      check.name,
      result.headline,
      result.remediation ?? '',
      result.details ?? {},
    );
  }
}
