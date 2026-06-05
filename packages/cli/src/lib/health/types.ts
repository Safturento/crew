import type { ProjectConfig } from 'crew-shared';
import type { DockerPorts } from '../mcp-config/index.js';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface CheckResult {
  status: CheckStatus;
  headline: string;
  remediation?: string;
  details?: Record<string, string>;
  fixable?: boolean;
}

export interface HealthContext {
  config: ProjectConfig;
  worktree: string;
  /** Materialized env vars from env.toml (when the project uses one). */
  envVars?: Record<string, string>;
  /**
   * Resolved docker port map. Dispatch-only (supplied by the fresh-mode gate so
   * the app-url check can resolve `{httpsPort}`-style templates); absent under
   * `crew doctor`, where templates resolve from `envVars` alone.
   */
  dockerPorts?: DockerPorts;
}

export interface HealthCheck {
  /** Stable identifier used in reports, registry filtering, and gate errors. */
  name: string;
  /** `project` checks need a config + worktree; `machine` checks are host-wide. */
  scope: 'project' | 'machine';
  detect: (ctx: HealthContext) => Promise<CheckResult>;
  /** Optional auto-repair. Present only when `detect` can yield `fixable: true`. */
  fix?: (ctx: HealthContext) => Promise<void>;
}

type Extra = Omit<CheckResult, 'status' | 'headline'>;

export const ok = (headline: string, extra: Extra = {}): CheckResult => ({
  status: 'ok',
  headline,
  ...extra,
});

export const warn = (headline: string, extra: Extra = {}): CheckResult => ({
  status: 'warn',
  headline,
  ...extra,
});

export const fail = (headline: string, extra: Extra = {}): CheckResult => ({
  status: 'fail',
  headline,
  ...extra,
});
