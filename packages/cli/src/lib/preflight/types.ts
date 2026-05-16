import type { ProjectConfig } from 'crew-shared';
import type { DockerPorts } from '../mcp-config/index.js';

export interface PreflightCheckContext {
  config: ProjectConfig;
  worktree: string;
  /** Resolved docker port map (only present in fresh-mode dispatch). */
  dockerPorts?: DockerPorts;
  /** Materialized env vars from env.toml (only present for env.toml projects). */
  envVars?: Record<string, string>;
}

export interface PreflightCheck {
  /** Stable identifier used in error messages and logs. */
  name: string;
  run: (ctx: PreflightCheckContext) => Promise<void>;
}

/**
 * Thrown by checks when verification fails. The orchestrator catches and
 * re-throws this so the calling command (run / resume / fix-pr) can render
 * the structured remediation output before exiting.
 */
export class PreflightError extends Error {
  constructor(
    public readonly checkName: string,
    public readonly headline: string,
    public readonly remediation: string,
    public readonly details: Record<string, string> = {},
  ) {
    super(`preflight ${checkName}: ${headline}`);
    this.name = 'PreflightError';
  }
}
