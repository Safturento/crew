import type { ProjectConfig } from 'crew-shared';
import { probeUrl } from './probe-url.js';
import { PreflightError, type PreflightCheck } from './types.js';

interface UrlToProbe {
  url: string;
  source: string;
}

function urlsToProbe(config: ProjectConfig): UrlToProbe[] {
  const out: UrlToProbe[] = [];

  if (config.playwright && config.docker && !config.playwright.start_command) {
    out.push({ url: config.playwright.app_url, source: '[playwright].app_url' });
  }

  if (config.bruno_smoke && config.docker) {
    out.push({ url: config.bruno_smoke.base_url, source: '[bruno_smoke].base_url' });
  }

  return out;
}

export function probeAppUrlsCheck(): PreflightCheck {
  return {
    name: 'app-url-reachability',
    run: async ({ config }) => {
      const urls = urlsToProbe(config);
      for (const { url, source } of urls) {
        const result = await probeUrl(url);
        if (!result.reachable) {
          const errCode = result.lastError?.code ?? 'unknown';
          throw new PreflightError(
            'app-url-reachability',
            'app URL unreachable',
            'crew restart <KEY> --hard, or investigate the bringup log',
            {
              url: `${url} (from ${source})`,
              tried: `${result.attempts} attempts × exponential backoff, all ${errCode}`,
              likely: 'docker compose stack failed to come up — check /tmp/crew-docker-<KEY>.log',
            },
          );
        }
      }
    },
  };
}
