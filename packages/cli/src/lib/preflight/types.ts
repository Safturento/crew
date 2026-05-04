import type { ProjectConfig } from 'crew-shared';

export interface PreflightCheckContext {
  config: ProjectConfig;
  worktree: string;
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
