import type { EnvSpec } from './types.js';
import { collectAllKeys, ENV_SPEC_BUILTINS, substitute, topoSortKeys } from './resolve.js';
import { allocatePort } from './allocate-port.js';
import { runGenerator, runFileGenerator } from './generate.js';

export interface MaterializeOptions {
  /**
   * Project canonical name (e.g. "recipes"). Built-in: ${BASE_NAME}.
   *
   * Lowercased before substitution: BASE_NAME and WORKTREE_ID flow into
   * docker compose project / network / container names, hostnames, and
   * URLs — all of which require lowercase. Callers may pass any casing.
   */
  baseName: string;
  /**
   * Worktree identifier (e.g. "main", "kan-23"). Built-in: ${WORKTREE_ID}.
   * Lowercased before substitution — see `baseName`.
   */
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

export function materialize(spec: EnvSpec, opts: MaterializeOptions): MaterializeResult {
  const map: Record<string, string> = {
    BASE_NAME: opts.baseName.toLowerCase(),
    WORKTREE_ID: opts.worktreeId.toLowerCase(),
  };

  // Files first: their `${path}` substitution is self-contained, and populating
  // `map[envVar]` upfront lets later orchestration templates / app literals
  // reference a `[files.*]` env_var without triggering a missing-ref throw.
  for (const fileEntry of Object.values(spec.files)) {
    runFileGenerator({
      path: fileEntry.path,
      generator: fileEntry.generator,
      pathSubstitution: fileEntry.path,
    });
    if (fileEntry.env_var) map[fileEntry.env_var] = fileEntry.path;
  }

  const deps = collectAllKeys({ spec, builtins: [...ENV_SPEC_BUILTINS] });
  const order = topoSortKeys(deps);

  for (const key of order) {
    if (key in map) continue; // built-ins + already-populated file env_vars

    const orchEntry = spec.orchestration[key];
    if (orchEntry) {
      if (orchEntry.kind === 'port') {
        const cached = opts.cacheEnv[key];
        if (cached !== undefined) {
          map[key] = cached;
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
        const cached = opts.cacheEnv[key];
        const shared =
          !opts.isCanonical && appEntry.share !== false ? opts.canonicalEnv?.[key] : undefined;
        if (cached !== undefined) {
          map[key] = cached;
        } else if (shared !== undefined) {
          map[key] = shared;
        } else {
          map[key] = runGenerator(appEntry.command);
        }
      }
    }
  }

  const take = (k: string): string => {
    const v = map[k];
    if (v === undefined) {
      throw new Error(
        `env.toml: internal error — \`${k}\` was not resolved during materialization`,
      );
    }
    return v;
  };

  const base: Record<string, string> = {};
  for (const k of Object.keys(spec.orchestration)) base[k] = take(k);
  for (const k of Object.keys(spec.app)) base[k] = take(k);
  for (const f of Object.values(spec.files)) {
    if (f.env_var) base[f.env_var] = take(f.env_var);
  }

  const contexts: Record<string, Record<string, string>> = {};
  for (const [ctxName, overrides] of Object.entries(spec.contexts)) {
    const resolved: Record<string, string> = {};
    for (const [k, v] of Object.entries(overrides)) resolved[k] = substitute(v, map);
    contexts[ctxName] = resolved;
  }

  return { base, contexts };
}
