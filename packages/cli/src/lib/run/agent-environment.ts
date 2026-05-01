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
} from '../playwright/index.js';
import { agentNeedsAppRunning } from './app-lifecycle.js';

export interface AgentEnvironmentOptions {
  config: ProjectConfig;
  worktree: string;
  key: string;
  env: NodeJS.ProcessEnv;
  dockerPorts?: DockerPorts;
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
  const { config, worktree, key, env, dockerPorts, mode, skipDocker } = opts;
  const result: AgentEnvironmentResult = {};

  if (playwrightEnabled(config) && config.playwright) {
    result.resolvedAppUrl = resolveAppUrl(config.playwright.app_url, dockerPorts).raw;
  }

  if (mode === 'fresh') {
    const proc = startDockerBringup({
      config,
      worktree,
      key,
      skip: Boolean(skipDocker),
      env,
    });
    if (proc) result.dockerProcess = proc;
  } else if (!skipDocker && agentNeedsAppRunning(config) && config.docker) {
    console.log(pc.dim('→ ensuring docker stack is running…'));
    const ensure = await ensureStackRunning({ worktree, key, env });
    if (ensure.rc !== 0) {
      throw new Error(`docker stack failed to come up (rc=${ensure.rc}). Log: ${ensure.logPath}`);
    }
    console.log(pc.dim(`    log: ${ensure.logPath}`));
  }

  if (playwrightEnabled(config)) {
    console.log(pc.dim('→ ensuring Chromium is installed for Playwright…'));
    const install = await installPlaywrightBrowsers({ worktree, key, env });
    result.playwrightLogPath = install.logPath;
    if (install.rc !== 0) {
      throw new Error(`playwright install failed (rc=${install.rc}). Log: ${install.logPath}`);
    }
    console.log(pc.dim(`    log: ${install.logPath}`));
  }

  return result;
}
