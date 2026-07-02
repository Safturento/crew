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
import { agentNeedsAppRunning } from './app-lifecycle.js';
import { installNodeModules } from './install-node-modules.js';
import { bracketStartupPhase } from '../startup-events/index.js';
import { dockerLogPathFor, npmInstallLogPathFor, playwrightLogPathFor } from './paths.js';

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

    // CREW-313: bracket the Chromium install so a throw here records a
    // `crew_startup_playwright_install` `failed` phase (with its log path)
    // instead of a silent all-green timeline.
    const install = await bracketStartupPhase(
      key,
      {
        subtype: 'crew_startup_playwright_install',
        startedSummary: 'installing Chromium for Playwright',
        completedSummary: () => 'Chromium ready',
        completedLogPath: playwrightLogPathFor(key),
        failedLogPath: playwrightLogPathFor(key),
      },
      async () => {
        console.log(pc.dim('→ ensuring Chromium is installed for Playwright…'));
        const r = await installPlaywrightBrowsers({ worktree, key, env });
        if (r.rc !== 0) {
          throw new Error(`playwright install failed (rc=${r.rc}). Log: ${r.logPath}`);
        }
        console.log(pc.dim(`    log: ${r.logPath}`));
        return r;
      },
    );
    result.playwrightLogPath = install.logPath;
  }

  // CREW-313: bracket the dispatch preflight gate. A `PreflightError` thrown
  // here re-throws unchanged (caught upstream by `runTrackedPreflight`, which
  // records the structured failed-start on the run row), but now it also
  // records a red `crew_startup_dispatch_preflight` phase on the startup
  // timeline — carrying `preflight <check>: <headline>` as its summary — so the
  // dispatch gate is no longer invisible on an otherwise all-green timeline.
  await bracketStartupPhase(
    key,
    {
      subtype: 'crew_startup_dispatch_preflight',
      startedSummary: 'running dispatch preflight checks',
      completedSummary: () => 'dispatch preflight passed',
    },
    () => runPreflight({ config, worktree, dockerPorts, envVars }),
  );

  return result;
}
