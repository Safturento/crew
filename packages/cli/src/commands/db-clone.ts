import { basename } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import {
  discoverProjectConfig,
  runDbClone,
  worktreePathFor,
  type ProjectConfig,
} from '../lib/index.js';

export interface DbCloneCommandDeps {
  config: ProjectConfig;
  log: (msg: string) => void;
}

export interface DbCloneCommandResult {
  ok: boolean;
  reason?: string;
}

/**
 * Compose project name for a worktree path. `writeDockerEnv` derives this
 * from the lowercased basename, so we mirror that here to find the
 * matching containers regardless of whether the .env wrote a custom value.
 */
export function computeComposeProject(worktreePath: string): string {
  return basename(worktreePath.replace(/\/+$/, '')).toLowerCase();
}

export async function runDbCloneCommand(
  key: string,
  deps: DbCloneCommandDeps,
): Promise<DbCloneCommandResult> {
  const { config, log } = deps;

  if (!config.docker) {
    return {
      ok: false,
      reason: `project config '${config.name}' has no [docker] section — db-clone needs the canonical worktree name.`,
    };
  }

  const canonicalProject = config.docker.canonical_worktree.toLowerCase();
  const targetWorktree = worktreePathFor(config.repo_path, key);
  const targetProject = computeComposeProject(targetWorktree);

  log(`canonical project: ${canonicalProject}`);
  log(`target project:    ${targetProject}`);

  try {
    await runDbClone({
      canonicalProject,
      targetProject,
      settings: config.db_clone,
      log,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

export const dbCloneCommand = new Command('db-clone')
  .description("clone main's postgres data into the worktree's stack for <key>")
  .argument('<key>', 'ticket key, e.g. KAN-23')
  .action(async (key: string) => {
    const cwd = process.cwd();
    const config = await discoverProjectConfig(cwd);
    if (!config) {
      console.error(pc.red('✗'), `no crew project config matches ${cwd}`);
      process.exit(1);
    }
    const result = await runDbCloneCommand(key, {
      config,
      log: (msg) => console.log(pc.dim('→'), msg),
    });
    if (!result.ok) {
      console.error(pc.red('✗'), result.reason ?? 'db-clone failed');
      process.exit(1);
    }
    console.log(pc.green('✓'), `cloned ${config.docker?.canonical_worktree} → ${key}`);
  });
