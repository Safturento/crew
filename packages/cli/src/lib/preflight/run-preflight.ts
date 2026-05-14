import type { ProjectConfig } from 'crew-shared';
import type { DockerPorts } from '../mcp-config/index.js';
import type { PreflightCheck } from './types.js';

export interface RunPreflightOptions {
  config: ProjectConfig;
  worktree: string;
  checks: PreflightCheck[];
  dockerPorts?: DockerPorts;
  envVars?: Record<string, string>;
}

export async function runPreflight(opts: RunPreflightOptions): Promise<void> {
  for (const check of opts.checks) {
    await check.run({
      config: opts.config,
      worktree: opts.worktree,
      dockerPorts: opts.dockerPorts,
      envVars: opts.envVars,
    });
  }
}
