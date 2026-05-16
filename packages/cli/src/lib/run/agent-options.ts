import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { resolveBrunoEnvName } from '../bruno-smoke/index.js';
import { parseEnvFile } from '../env-spec/index.js';
import {
  authoredEnabled,
  playwrightEnabled,
  resolveAppUrl,
  smokeEnabled,
  verifyAfterRunEnabled,
  type DockerPorts,
} from '../mcp-config/index.js';
import type {
  BrunoSmokePromptOptions,
  PlaywrightFixPrOptions,
  PlaywrightPromptOptions,
} from '../prompts/index.js';

const PORT_PLACEHOLDER_RE = /\{[a-zA-Z]+Port\}/;

/**
 * Read the docker host ports from a worktree's `.env` file. Used by
 * commands that resume an existing worktree (fix-pr, resume) — they
 * cannot regenerate the env, so the on-disk file is authoritative.
 */
export function readDockerPortsFromEnvFile(worktree: string): DockerPorts {
  const envPath = join(worktree, '.env');
  if (!existsSync(envPath)) {
    throw new Error(
      `cannot resolve port placeholders: ${envPath} not found. ` +
        `Run 'crew run <KEY>' first or remove port placeholders from app_url / base_url.`,
    );
  }
  const raw = readFileSync(envPath, 'utf8');
  const get = (key: string): number => {
    const match = raw.match(new RegExp(`^${key}=(\\d+)$`, 'm'));
    if (!match) throw new Error(`${key} not found in ${envPath}`);
    return Number(match[1]);
  };
  return {
    httpPort: get('CADDY_HTTP_PORT'),
    httpsPort: get('CADDY_HTTPS_PORT'),
    postgresPort: get('POSTGRES_PORT'),
  };
}

/**
 * Read a worktree's materialized `.env` as a `${VAR}` substitution map for
 * `resolveAppUrl` in the resume / fix-pr paths. Returns `undefined` for
 * legacy projects without `env.toml`.
 *
 * Read-only: does NOT call `materialize()` — re-running the port
 * allocator on resume would shift host ports out from under a live agent
 * (the allocator is hash-based on the worktree basename and stable, but
 * `source = "generate"` entries would also re-execute, which we don't
 * want during a resume).
 */
export function readEnvBaseMap(worktree: string): Record<string, string> | undefined {
  if (!existsSync(join(worktree, 'env.toml'))) return undefined;
  const envPath = join(worktree, '.env');
  if (!existsSync(envPath)) return undefined;
  return parseEnvFile(readFileSync(envPath, 'utf8'));
}

/**
 * Whether the resolved app/base URLs need the worktree's docker port
 * substitutions. Returns true if either bruno-smoke or playwright has a
 * `{httpPort}` / `{httpsPort}` / `{postgresPort}` placeholder.
 */
export function needsDockerPorts(config: ProjectConfig): boolean {
  const brunoUsesPort = Boolean(
    config.bruno_smoke?.enabled && PORT_PLACEHOLDER_RE.test(config.bruno_smoke.base_url),
  );
  const pwUsesPort = Boolean(
    playwrightEnabled(config) &&
    config.playwright &&
    PORT_PLACEHOLDER_RE.test(config.playwright.app_url),
  );
  return brunoUsesPort || pwUsesPort;
}

/**
 * Resolve the bruno-smoke prompt options for a worktree. Reads
 * `dockerPorts` from disk only when the configured `base_url` actually
 * contains a port placeholder — keeps the no-docker fast-path off disk.
 */
export function brunoSmokeOptionsFor(
  config: ProjectConfig,
  worktree: string,
  dockerPorts?: DockerPorts,
  envVars?: Record<string, string>,
): BrunoSmokePromptOptions | undefined {
  const bs = config.bruno_smoke;
  if (!bs?.enabled) return undefined;

  const ports =
    dockerPorts ??
    (PORT_PLACEHOLDER_RE.test(bs.base_url) ? readDockerPortsFromEnvFile(worktree) : undefined);

  const baseUrl = resolveAppUrl(bs.base_url, ports, envVars).raw;
  return {
    baseUrl,
    envName: resolveBrunoEnvName(worktree),
    collectionDir: bs.collection_dir,
    hasSmokeUser: Boolean(bs.smoke_user),
  };
}

/**
 * Map a project config to the playwright options shape consumed by
 * `buildFixPrPrompt` / `buildResumePrompt`. Returns undefined when
 * playwright is disabled or the app URL has not been resolved.
 */
export function playwrightFixPrOptsFor(
  config: ProjectConfig,
  resolvedAppUrl: string | undefined,
): PlaywrightFixPrOptions | undefined {
  if (!playwrightEnabled(config) || !resolvedAppUrl || !config.playwright) return undefined;
  return {
    appUrl: resolvedAppUrl,
    authored:
      authoredEnabled(config) && config.playwright.authored
        ? {
            testsDir: config.playwright.authored.tests_dir,
            testCommand: config.playwright.authored.test_command,
          }
        : undefined,
  };
}

/**
 * Map a project config to the playwright options shape consumed by
 * `buildTicketPrompt` (richer than the fix-pr shape — includes smoke +
 * start_command). Returns undefined when playwright is disabled or the
 * app URL has not been resolved.
 *
 * `gateWillRun` overrides the prompt's `verifyAfterRun` flag — pass true
 * only when the baseline check has confirmed the gate will actually fire.
 * Defaults to the config-level `verify_after_run` value (back-compat for
 * callers that haven't done the baseline pre-flight).
 */
export function playwrightTicketOptsFor(
  config: ProjectConfig,
  resolvedAppUrl: string | undefined,
  gateWillRun?: boolean,
): PlaywrightPromptOptions | undefined {
  if (!playwrightEnabled(config) || !resolvedAppUrl || !config.playwright) return undefined;
  return {
    appUrl: resolvedAppUrl,
    startCommand: config.playwright.start_command,
    smoke: smokeEnabled(config) || undefined,
    authored:
      authoredEnabled(config) && config.playwright.authored
        ? {
            testsDir: config.playwright.authored.tests_dir,
            testCommand: config.playwright.authored.test_command,
            verifyAfterRun: gateWillRun ?? verifyAfterRunEnabled(config),
          }
        : undefined,
  };
}
