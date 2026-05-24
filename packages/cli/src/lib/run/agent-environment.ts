import type { ResultPromise } from 'execa';
import pc from 'picocolors';
import type { ProjectConfig } from 'crew-shared';
import { ensureStackRunning } from '../docker/ensure-stack-running.js';
import { startDockerBringup } from '../docker/start-bringup.js';
import {
  installPlaywrightBrowsers,
  playwrightEnabled,
  resolveAppUrl,
  type DockerPorts,
} from '../mcp-config/index.js';
import { runPreflight } from '../preflight/index.js';
import { buildPreflightChecks } from '../preflight/build-checks.js';
import { agentNeedsAppRunning } from './app-lifecycle.js';
import { installNodeModules } from './install-node-modules.js';
import { bracketStartupPhase } from '../startup-events/index.js';
import { dockerLogPathFor, npmInstallLogPathFor } from './paths.js';

export interface AgentEnvironmentOptions {
  config: ProjectConfig;
  worktree: string;
  key: string;
  env: NodeJS.ProcessEnv;
  dockerPorts?: DockerPorts;
  envVars?: Record<string, string>;
  mode: 'fresh' | 'resume';
  skipDocker?: boolean;
}

export interface AgentEnvironmentResult {
  /** Background docker bringup handle. Only set in `mode: 'fresh'`. */
  dockerProcess?: ResultPromise;
  /** Resolved playwright app URL. Only set when playwright is enabled. */
  resolvedAppUrl?: string;
  /** Path to the chromium-install log. Only set when playwright is enabled. */
  playwrightLogPath?: string;
  /** Path to the npm-install log. Only set when playwright is enabled. */
  npmInstallLogPath?: string;
}

/**
 * Pre-spawn orchestration shared by `crew run` (fresh) and `crew fix-pr`
 * (resume). Resolves the playwright URL, brings up docker (background in
 * fresh mode, blocking in resume), and installs chromium when playwright is
 * enabled. Throws on any non-zero rc with the log path embedded so the
 * caller can surface it.
 */
export async function prepareAgentEnvironment(
  opts: AgentEnvironmentOptions,
): Promise<AgentEnvironmentResult> {
  const { config, worktree, key, env, dockerPorts, envVars, mode, skipDocker } = opts;
  const result: AgentEnvironmentResult = {};

  if (playwrightEnabled(config) && config.playwright) {
    result.resolvedAppUrl = resolveAppUrl(config.playwright.app_url, dockerPorts, envVars).raw;
  }

  if (mode === 'fresh') {
    const proc = startDockerBringup({
      config,
      worktree,
      key,
      skip: Boolean(skipDocker),
      env,
    });
    if (proc) {
      await bracketStartupPhase(
        key,
        {
          subtype: 'crew_startup_docker',
          startedSummary: 'docker compose up --build --wait',
          completedSummary: () => 'docker stack healthy',
          completedLogPath: dockerLogPathFor(key),
          failedLogPath: dockerLogPathFor(key),
        },
        async () => {
          console.log(pc.dim('→ awaiting docker bringup…'));
          const finished = await proc;
          if (finished.exitCode !== 0) {
            throw new Error(
              `docker bringup failed (rc=${finished.exitCode}). Check /tmp/crew-docker-${key}.log`,
            );
          }
        },
      );
      result.dockerProcess = proc;
    }
  } else if (!skipDocker && agentNeedsAppRunning(config) && config.docker) {
    await bracketStartupPhase(
      key,
      {
        subtype: 'crew_startup_docker',
        startedSummary: 'ensuring docker stack is running',
        completedSummary: () => 'docker stack ready (resume)',
        completedLogPath: dockerLogPathFor(key),
        failedLogPath: dockerLogPathFor(key),
      },
      async () => {
        console.log(pc.dim('→ ensuring docker stack is running…'));
        const ensure = await ensureStackRunning({ worktree, key, env });
        if (ensure.rc !== 0) {
          throw new Error(
            `docker stack failed to come up (rc=${ensure.rc}). Log: ${ensure.logPath}`,
          );
        }
        console.log(pc.dim(`    log: ${ensure.logPath}`));
      },
    );
  }

  if (playwrightEnabled(config)) {
    const npmInstall = await bracketStartupPhase(
      key,
      {
        subtype: 'crew_startup_npm_install',
        startedSummary: 'npm ci in worktree',
        completedSummary: () => 'npm ci completed',
        completedLogPath: npmInstallLogPathFor(key),
        failedLogPath: npmInstallLogPathFor(key),
      },
      async () => {
        console.log(pc.dim('→ installing worktree node_modules…'));
        const r = await installNodeModules({ worktree, key, env });
        if (r.rc !== 0) {
          throw new Error(`npm install failed (rc=${r.rc}). Log: ${r.logPath}`);
        }
        console.log(pc.dim(`    log: ${r.logPath}`));
        return r;
      },
    );
    result.npmInstallLogPath = npmInstall.logPath;

    console.log(pc.dim('→ ensuring Chromium is installed for Playwright…'));
    const install = await installPlaywrightBrowsers({ worktree, key, env });
    result.playwrightLogPath = install.logPath;
    if (install.rc !== 0) {
      throw new Error(`playwright install failed (rc=${install.rc}). Log: ${install.logPath}`);
    }
    console.log(pc.dim(`    log: ${install.logPath}`));
  }

  await runPreflight({
    config,
    worktree,
    checks: buildPreflightChecks(config),
    dockerPorts,
    envVars,
  });

  return result;
}
