import type { EnvSpec } from './types.js';

/** Match `${NAME}` where NAME is identifier-shaped. */
const REF_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Return the unique list of `${...}` reference names in `value`, in first-seen order. */
export function extractRefs(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of value.matchAll(REF_RE)) {
    const name = m[1];
    if (name === undefined) continue;
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Topologically sort keys so each key follows its dependencies. Throws on cycles
 * and on references to unknown names.
 */
export function topoSortKeys(deps: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const out: string[] = [];

  const visit = (key: string, path: string[]) => {
    if (visited.has(key)) return;
    if (onStack.has(key)) {
      throw new Error(`env.toml: cycle detected: ${[...path, key].join(' → ')}`);
    }
    const depList = deps.get(key);
    if (depList === undefined) {
      throw new Error(`env.toml: \`${path.at(-1) ?? '<root>'}\` references unknown key \`${key}\``);
    }
    onStack.add(key);
    for (const d of depList) visit(d, [...path, key]);
    onStack.delete(key);
    visited.add(key);
    out.push(key);
  };

  for (const k of deps.keys()) visit(k, []);
  return out;
}

/** Replace every `${...}` in `value` with the corresponding entry from `map`. */
export function substitute(value: string, map: Record<string, string>): string {
  return value.replace(REF_RE, (_full, name: string) => {
    const resolved = map[name];
    if (resolved === undefined) {
      throw new Error(`env.toml: substitution failed — \`\${${name}}\` is not resolved`);
    }
    return resolved;
  });
}

export interface ResolutionContext {
  spec: EnvSpec;
  /** Built-in names that resolve before the spec's own keys (BASE_NAME, WORKTREE_ID). */
  builtins: string[];
}

/**
 * Collect every key the materializer must resolve, with its dependency list.
 * Includes built-ins as zero-dep nodes so that subsequent topo-sort + substitute
 * never errors on a known built-in reference.
 */
export function collectAllKeys(ctx: ResolutionContext): Map<string, string[]> {
  const out = new Map<string, string[]>();

  for (const b of ctx.builtins) out.set(b, []);

  for (const [name, entry] of Object.entries(ctx.spec.orchestration)) {
    if (entry.kind === 'template') out.set(name, extractRefs(entry.value));
    else out.set(name, []);
  }

  for (const [name, entry] of Object.entries(ctx.spec.app)) {
    if (entry.source === 'literal') out.set(name, extractRefs(entry.value));
    else out.set(name, []);
  }

  // [files.*] env_var keys are resolved AFTER files run, so we treat them as
  // zero-dep nodes here. The materializer fills them after running generators.
  for (const entry of Object.values(ctx.spec.files)) {
    if (entry.env_var) out.set(entry.env_var, []);
  }

  return out;
}

/**
 * Side-effect-free validation: parses succeeded, all `${...}` references
 * resolve, no cycles. Does NOT execute generators or write files. Used by
 * `crew env validate`.
 */
export function validateSpec(spec: EnvSpec): void {
  const builtins = ['BASE_NAME', 'WORKTREE_ID'];
  const deps = collectAllKeys({ spec, builtins });
  topoSortKeys(deps); // throws on cycle or missing ref

  const known = new Set(deps.keys());
  for (const [ctxName, overrides] of Object.entries(spec.contexts)) {
    for (const [varName, value] of Object.entries(overrides)) {
      for (const ref of extractRefs(value)) {
        if (!known.has(ref)) {
          throw new Error(
            `env.toml: context "${ctxName}" override of "${varName}" references unknown key \`${ref}\``,
          );
        }
      }
    }
  }
}
