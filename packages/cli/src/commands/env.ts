import { basename, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { Command } from 'commander';
import pc from 'picocolors';
import {
  discoverProjectConfig,
  loadEnvSpec,
  materialize,
  emit,
  parseEnvFile,
  validateSpec,
  type ProjectConfig,
} from '../lib/index.js';

export interface EnvDeps {
  worktree: string;
  config: ProjectConfig;
  log: (msg: string) => void;
}

export interface EnvValidateDeps {
  worktree: string;
  log: (msg: string) => void;
}

export interface EnvResult {
  ok: boolean;
  reason?: string;
}

const SPEC_FILENAME = 'env.toml';

function readCacheEnv(path: string): Record<string, string> {
  return existsSync(path) ? parseEnvFile(readFileSync(path, 'utf8')) : {};
}

function readCanonicalEnv(
  worktreeRoot: string,
  canonicalWorktreeName: string,
  currentBasename: string,
): Record<string, string> | undefined {
  if (currentBasename === canonicalWorktreeName) return undefined;
  const parent = join(worktreeRoot, '..');
  const canonicalPath = join(parent, canonicalWorktreeName, '.env');
  return existsSync(canonicalPath) ? parseEnvFile(readFileSync(canonicalPath, 'utf8')) : undefined;
}

function specPathFor(worktree: string): string {
  return join(worktree, SPEC_FILENAME);
}

function ensureSpecExists(worktree: string): string | null {
  const path = specPathFor(worktree);
  return existsSync(path) ? path : null;
}

async function runMaterialize(deps: EnvDeps, isCanonical: boolean): Promise<EnvResult> {
  const specPath = ensureSpecExists(deps.worktree);
  if (!specPath) {
    return { ok: false, reason: `no ${SPEC_FILENAME} at ${deps.worktree}` };
  }
  if (!deps.config.docker?.canonical_worktree) {
    return {
      ok: false,
      reason: `project config '${deps.config.name}' has no [docker].canonical_worktree — required for env-spec materialization`,
    };
  }

  try {
    const spec = loadEnvSpec(specPath);
    const wtBasename = basename(deps.worktree);
    const canonicalName = deps.config.docker.canonical_worktree;
    const result = materialize(spec, {
      baseName: deps.config.name,
      worktreeId:
        wtBasename === canonicalName ? 'main' : wtBasename.replace(`${canonicalName}-`, ''),
      worktreeBasename: wtBasename,
      isCanonical,
      cacheEnv: readCacheEnv(join(deps.worktree, '.env')),
      canonicalEnv: readCanonicalEnv(deps.worktree, canonicalName, wtBasename),
    });
    emit({ worktreeRoot: deps.worktree, base: result.base, contexts: result.contexts });
    deps.log(`wrote ${join(deps.worktree, '.env')}`);
    for (const ctx of Object.keys(result.contexts)) {
      deps.log(`wrote ${join(deps.worktree, `.env.${ctx}`)}`);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

export async function runEnvInit(deps: EnvDeps): Promise<EnvResult> {
  const wtBasename = basename(deps.worktree);
  const isCanonical = wtBasename === deps.config.docker?.canonical_worktree;
  return runMaterialize(deps, isCanonical);
}

export async function runEnvRefresh(deps: EnvDeps): Promise<EnvResult> {
  const wtBasename = basename(deps.worktree);
  const isCanonical = wtBasename === deps.config.docker?.canonical_worktree;
  return runMaterialize(deps, isCanonical);
}

export async function runEnvValidate(deps: EnvValidateDeps): Promise<EnvResult> {
  const specPath = ensureSpecExists(deps.worktree);
  if (!specPath) return { ok: false, reason: `no ${SPEC_FILENAME} at ${deps.worktree}` };
  try {
    const spec = loadEnvSpec(specPath);
    validateSpec(spec);
    deps.log('env.toml is valid');
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

export const envCommand = new Command('env')
  .description('manage env.toml-driven .env materialization for the current worktree')
  .addCommand(
    new Command('init')
      .description(
        'materialize .env from env.toml in the current worktree (use on canonical or fresh worktrees)',
      )
      .action(async () => {
        const cwd = process.cwd();
        const config = await discoverProjectConfig(cwd);
        if (!config) {
          console.error(pc.red('✗'), `no crew project config matches ${cwd}`);
          process.exit(1);
        }
        const result = await runEnvInit({
          worktree: cwd,
          config,
          log: (msg) => console.log(pc.green('✓'), msg),
        });
        if (!result.ok) {
          console.error(pc.red('✗'), result.reason ?? 'env init failed');
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command('refresh')
      .description('re-materialize .env after editing env.toml (preserves cached generated values)')
      .action(async () => {
        const cwd = process.cwd();
        const config = await discoverProjectConfig(cwd);
        if (!config) {
          console.error(pc.red('✗'), `no crew project config matches ${cwd}`);
          process.exit(1);
        }
        const result = await runEnvRefresh({
          worktree: cwd,
          config,
          log: (msg) => console.log(pc.green('✓'), msg),
        });
        if (!result.ok) {
          console.error(pc.red('✗'), result.reason ?? 'env refresh failed');
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command('validate')
      .description('schema-check env.toml without writing anything')
      .action(async () => {
        const cwd = process.cwd();
        const result = await runEnvValidate({
          worktree: cwd,
          log: (msg) => console.log(pc.green('✓'), msg),
        });
        if (!result.ok) {
          console.error(pc.red('✗'), result.reason ?? 'env validate failed');
          process.exit(1);
        }
      }),
  );
