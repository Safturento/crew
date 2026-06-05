import type { ProjectConfig } from 'crew-shared';
import { playwrightEnabled, resolveAppUrl } from '../../mcp-config/index.js';
import { probeUrl } from '../probe-url.js';
import { fail, ok, type HealthCheck } from '../types.js';

interface UrlToProbe {
  template: string;
  source: string;
}

/**
 * The app URLs whose reachability gates dispatch. Mirrors the former
 * `lib/preflight/probe-app-urls.ts` applicability exactly: the playwright
 * `app_url` (only when docker-backed, a smoke/authored mode is enabled, and the
 * agent isn't starting the app itself via `start_command`), and the bruno
 * `base_url` (when docker-backed).
 */
function urlsToProbe(config: ProjectConfig): UrlToProbe[] {
  const out: UrlToProbe[] = [];

  if (
    config.playwright &&
    playwrightEnabled(config) &&
    config.docker &&
    !config.playwright.start_command
  ) {
    out.push({ template: config.playwright.app_url, source: '[playwright].app_url' });
  }

  if (config.bruno_smoke && config.docker) {
    out.push({ template: config.bruno_smoke.base_url, source: '[bruno_smoke].base_url' });
  }

  return out;
}

/**
 * Verify the project's configured app URL(s) both *resolve* and *respond*.
 *
 * Absorbs the former `lib/preflight/probe-app-urls.ts`. Two failure modes:
 *  - an `app_url` template with an unresolvable `{port}` / `${VAR}` placeholder
 *    → a fast, network-free `fail` pointing at `env.toml` (the addition over the
 *    old probe; useful to `crew doctor` and a clearer dispatch message);
 *  - a resolved URL that doesn't answer → the dispatch-critical reachability
 *    `fail` ("docker stack failed to come up"), preserved byte-for-byte.
 *
 * No `fix()`: reachability is dispatch-runtime state, and unresolved env is
 * `crew init` / `crew env init` territory (surfaced by `env-materialized`).
 */
export const appUrlResolves: HealthCheck = {
  name: 'app-url-resolves',
  scope: 'project',
  detect: async ({ config, dockerPorts, envVars }) => {
    const urls = urlsToProbe(config);
    if (urls.length === 0) return ok('no app URLs to verify');

    for (const { template, source } of urls) {
      let resolved: string;
      try {
        resolved = resolveAppUrl(template, dockerPorts, envVars).raw;
      } catch (err) {
        return fail('app URL has unresolved variables', {
          remediation: 'materialize env.toml (crew env init) or fix the app_url template',
          details: { template: `${template} (from ${source})`, error: (err as Error).message },
        });
      }

      const result = await probeUrl(resolved);
      if (!result.reachable) {
        const errCode = result.lastError?.code ?? 'unknown';
        return fail('app URL unreachable', {
          remediation: 'crew restart <KEY> --hard, or investigate the bringup log',
          details: {
            url: `${resolved} (from ${source})`,
            tried: `${result.attempts} attempts × exponential backoff, all ${errCode}`,
            likely: 'docker compose stack failed to come up — check /tmp/crew-docker-<KEY>.log',
          },
        });
      }
    }

    return ok('app URLs reachable');
  },
};
