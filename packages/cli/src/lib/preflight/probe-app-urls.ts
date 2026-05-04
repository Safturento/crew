import type { ProjectConfig } from 'crew-shared';
import { playwrightEnabled, resolveAppUrl, type DockerPorts } from '../playwright/index.js';
import { probeUrl } from './probe-url.js';
import { PreflightError, type PreflightCheck } from './types.js';

interface UrlToProbe {
  template: string;
  source: string;
}

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

export function probeAppUrlsCheck(): PreflightCheck {
  return {
    name: 'app-url-reachability',
    run: async ({ config, dockerPorts, envVars }) => {
      const urls = urlsToProbe(config);
      for (const { template, source } of urls) {
        const resolved = resolveUrl(template, dockerPorts, envVars);
        const result = await probeUrl(resolved);
        if (!result.reachable) {
          const errCode = result.lastError?.code ?? 'unknown';
          throw new PreflightError(
            'app-url-reachability',
            'app URL unreachable',
            'crew restart <KEY> --hard, or investigate the bringup log',
            {
              url: `${resolved} (from ${source})`,
              tried: `${result.attempts} attempts × exponential backoff, all ${errCode}`,
              likely: 'docker compose stack failed to come up — check /tmp/crew-docker-<KEY>.log',
            },
          );
        }
      }
    },
  };
}

function resolveUrl(
  template: string,
  dockerPorts: DockerPorts | undefined,
  envVars: Record<string, string> | undefined,
): string {
  return resolveAppUrl(template, dockerPorts, envVars).raw;
}
