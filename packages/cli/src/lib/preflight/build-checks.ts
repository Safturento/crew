import type { ProjectConfig } from 'crew-shared';
import { verifyExcludedCommandsCheck } from './verify-excluded-commands.js';
import type { PreflightCheck } from './types.js';

/**
 * Decides which preflight checks apply to a given project config.
 */
export function buildPreflightChecks(config: ProjectConfig): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  if (config.bruno_smoke?.enabled || config.playwright?.authored?.enabled) {
    checks.push(verifyExcludedCommandsCheck());
  }

  return checks;
}
