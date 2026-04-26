import { resolve } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { discoverProjectConfig, writeDockerEnv, type ProjectConfig } from '../lib/index.js';

export interface DockerEnvDeps {
  cwd: string;
  config: ProjectConfig;
  log: (msg: string) => void;
}

export interface DockerEnvResult {
  ok: boolean;
  reason?: string;
}

/**
 * Generate a per-worktree docker `.env` for `path` (default: cwd). Mirrors
 * the precursor `docker-env.sh`: refuses to clobber a hand-edited file,
 * uses canonical 80/443/5432 when the basename matches, hashes per the
 * shared port allocator otherwise.
 */
export async function runDockerEnv(
  path: string | undefined,
  deps: DockerEnvDeps,
): Promise<DockerEnvResult> {
  const { cwd, config, log } = deps;

  if (!config.docker) {
    return {
      ok: false,
      reason: `project config '${config.name}' has no [docker] section — add canonical_worktree (and optionally port bases) to enable docker-env.`,
    };
  }

  const target = resolve(cwd, path ?? '.');

  try {
    const env = writeDockerEnv(target, { canonicalWorktree: config.docker.canonical_worktree });
    log(`wrote ${env.envPath}`);
    log(`  project: ${env.composeProjectName}`);
    log(`  http:    ${env.caddyHttpPort}`);
    log(`  https:   ${env.caddyHttpsPort}`);
    log(`  pg:      ${env.postgresPort}`);
    log(`  url:     ${env.appUrl}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

export const dockerEnvCommand = new Command('docker-env')
  .description('generate a per-worktree docker `.env` (defaults to current worktree)')
  .argument('[path]', 'worktree directory to generate into (default: cwd)')
  .action(async (path: string | undefined) => {
    const cwd = process.cwd();
    const config = await discoverProjectConfig(cwd);
    if (!config) {
      console.error(pc.red('✗'), `no crew project config matches ${cwd}`);
      process.exit(1);
    }
    const result = await runDockerEnv(path, {
      cwd,
      config,
      log: (msg) => console.log(pc.green('✓'), msg),
    });
    if (!result.ok) {
      console.error(pc.red('✗'), result.reason ?? 'docker-env failed');
      process.exit(1);
    }
  });
