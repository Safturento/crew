import type { HealthCheck } from './types.js';
import { configValid } from './checks/config-valid.js';
import { envMaterialized } from './checks/env-materialized.js';
// P2 (dispatch-gate migration) and P3 (remaining checks) append their checks here.

const ALL: HealthCheck[] = [configValid, envMaterialized];

/**
 * Return the checks applicable to a scope. `project` and `machine` filter by
 * the check's own `scope`; `all` returns the full inventory (used by
 * `crew doctor --all` and the registry's own coverage assertions).
 */
export function checksFor(scope: 'project' | 'machine' | 'all'): HealthCheck[] {
  if (scope === 'all') return ALL;
  return ALL.filter((c) => c.scope === scope);
}
