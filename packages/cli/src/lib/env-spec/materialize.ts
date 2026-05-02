import type { EnvSpec } from './types.js';
import { collectAllKeys, substitute, topoSortKeys } from './resolve.js';
import { allocatePort } from './allocate-port.js';
import { runGenerator, runFileGenerator } from './generate.js';

export interface MaterializeOptions {
  /** Project canonical name (e.g. "recipes"). Built-in: ${BASE_NAME}. */
  baseName: string;
  /** Worktree identifier (e.g. "main", "kan-23"). Built-in: ${WORKTREE_ID}. */
  worktreeId: string;
  /** Worktree directory basename — input to the port allocator. */
  worktreeBasename: string;
  /** True for the canonical worktree. Drives port-default vs. allocate, and disables canonical-share lookup. */
  isCanonical: boolean;
  /** Existing .env contents parsed into a map (for idempotency). Pass `{}` if none. */
  cacheEnv: Record<string, string>;
  /** Canonical worktree's .env, if reachable. Used for sharing source = "generate" values. */
  canonicalEnv?: Record<string, string>;
}

export interface MaterializeResult {
  /** Variables for the base `.env`. */
  base: Record<string, string>;
  /** Per-context override files: contextName → varName → value. */
  contexts: Record<string, Record<string, string>>;
}

const BUILTIN_KEYS = ['BASE_NAME', 'WORKTREE_ID'];

export function materialize(spec: EnvSpec, opts: MaterializeOptions): MaterializeResult {
  const map: Record<string, string> = {
    BASE_NAME: opts.baseName,
    WORKTREE_ID: opts.worktreeId,
  };

  const deps = collectAllKeys({ spec, builtins: BUILTIN_KEYS });
  const order = topoSortKeys(deps);

  for (const key of order) {
    if (BUILTIN_KEYS.includes(key)) continue;

    const orchEntry = spec.orchestration[key];
    if (orchEntry) {
      if (orchEntry.kind === 'port') {
        if (key in opts.cacheEnv) {
          map[key] = opts.cacheEnv[key]!;
        } else if (opts.isCanonical && orchEntry.default !== undefined) {
          map[key] = String(orchEntry.default);
        } else {
          map[key] = String(allocatePort(opts.worktreeBasename, key));
        }
      } else {
        map[key] = substitute(orchEntry.value, map);
      }
      continue;
    }

    const appEntry = spec.app[key];
    if (appEntry) {
      if (appEntry.source === 'literal') {
        map[key] = substitute(appEntry.value, map);
      } else {
        if (key in opts.cacheEnv) {
          map[key] = opts.cacheEnv[key]!;
        } else if (
          !opts.isCanonical &&
          appEntry.share !== false &&
          opts.canonicalEnv &&
          key in opts.canonicalEnv
        ) {
          map[key] = opts.canonicalEnv[key]!;
        } else {
          map[key] = runGenerator(appEntry.command);
        }
      }
      continue;
    }

    // Falls through here only if the key was added by collectAllKeys for a [files.*]
    // env_var, or is a built-in we already populated.
  }

  for (const fileEntry of Object.values(spec.files)) {
    runFileGenerator({
      path: fileEntry.path,
      generator: fileEntry.generator,
      pathSubstitution: fileEntry.path,
    });
    if (fileEntry.env_var) map[fileEntry.env_var] = fileEntry.path;
  }

  const base: Record<string, string> = {};
  for (const k of Object.keys(spec.orchestration)) base[k] = map[k]!;
  for (const k of Object.keys(spec.app)) base[k] = map[k]!;
  for (const f of Object.values(spec.files)) {
    if (f.env_var) base[f.env_var] = map[f.env_var]!;
  }

  const contexts: Record<string, Record<string, string>> = {};
  for (const [ctxName, overrides] of Object.entries(spec.contexts)) {
    const resolved: Record<string, string> = {};
    for (const [k, v] of Object.entries(overrides)) resolved[k] = substitute(v, map);
    contexts[ctxName] = resolved;
  }

  return { base, contexts };
}
