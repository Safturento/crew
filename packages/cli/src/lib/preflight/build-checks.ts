import type { ProjectConfig } from 'crew-shared';
import type { PreflightCheck } from './types.js';

/**
 * Decides which preflight checks apply to a given project config.
 * Tickets B and C extend this as their checks land.
 */
export function buildPreflightChecks(_config: ProjectConfig): PreflightCheck[] {
  return [];
}
