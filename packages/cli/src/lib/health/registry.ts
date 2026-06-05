import type { HealthCheck } from './types.js';
import { configValid } from './checks/config-valid.js';
import { envMaterialized } from './checks/env-materialized.js';
import { playwrightConfig } from './checks/playwright-config.js';
import { brunoSkeleton } from './checks/bruno-skeleton.js';
import { baselinePresent } from './checks/baseline-present.js';
import { dockerSocket } from './checks/docker-socket.js';
import { aptDeps } from './checks/apt-deps.js';
import { chromiumInstalled } from './checks/chromium-installed.js';
// P2 (dispatch-gate migration) appends its checks here too.
import { excludedCommands } from './checks/excluded-commands.js';
import { appUrlResolves } from './checks/app-url-resolves.js';
// P3 (remaining checks) appends its checks here.

const ALL: HealthCheck[] = [
  configValid,
  envMaterialized,
  playwrightConfig,
  brunoSkeleton,
  baselinePresent,
  dockerSocket,
  aptDeps,
  chromiumInstalled,
  excludedCommands,
  appUrlResolves
];

/**
 * Return the checks applicable to a scope. `project` and `machine` filter by
 * the check's own `scope`; `all` returns the full inventory (used by
 * `crew doctor --all` and the registry's own coverage assertions).
 */
export function checksFor(scope: 'project' | 'machine' | 'all'): HealthCheck[] {
  if (scope === 'all') return ALL;
  return ALL.filter((c) => c.scope === scope);
}
