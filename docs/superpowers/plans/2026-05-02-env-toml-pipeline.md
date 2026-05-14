# `env.toml` materialization pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a declarative `env.toml` materialization pipeline to crew so that any project committing an `env.toml` at its repo root gets per-worktree `.env` generation (port allocation, secret generation, template substitution, context-override files) from a single source of truth. Replaces the hardcoded `writeDockerEnv` shape (`COMPOSE_PROJECT_NAME` + 3 fixed ports) with a project-driven schema. Existing projects without `env.toml` keep the legacy behavior untouched.

**Architecture:** New `lib/env-spec/` module under `packages/cli/src/lib/`: TOML schema types + parser, DAG resolver for `${...}` references, materialization pipeline (orchestration → app → files → emit base + per-context env files). Wired up via a new `crew env` parent command with `init`, `refresh`, `validate` subcommands, plus integration in the worktree-create path. The existing `crew docker-env` and `writeDockerEnv` are kept for backwards compatibility — projects without `env.toml` use the legacy path.

**Tech Stack:** TypeScript ESM, `smol-toml` (already a workspace dep via `@crew/shared`), Zod (already in use), Vitest (existing test infra), `commander` for CLI.

**Spec:** [`Recipes-App/docs/superpowers/specs/2026-05-02-cross-project-env-setup-design.md`](https://github.com/Safturento/Recipes/blob/spec/cross-project-env-setup/docs/superpowers/specs/2026-05-02-cross-project-env-setup-design.md) (lives in the Recipes repo because that's where the brainstorm originated; `cat` it once before starting if you don't have it open).

**Recipes counterpart:** Recipes ships `env.toml`, a bundled `scripts/setup.mjs` (no-crew canonical-only path), and the docker-compose / backend-config rewires in a sibling plan that runs _after_ this PR is merged and a new crew version is released.

---

## File Structure

**Created:**

- `packages/cli/src/lib/env-spec/types.ts` — Zod schemas + TS types for `env.toml`.
- `packages/cli/src/lib/env-spec/parse.ts` — read TOML file, validate via Zod, return typed spec.
- `packages/cli/src/lib/env-spec/resolve.ts` — extract `${...}` refs, build DAG, topologically sort, substitute.
- `packages/cli/src/lib/env-spec/allocate-port.ts` — per-key deterministic port allocator (generalizes today's fixed-shape `portHash`).
- `packages/cli/src/lib/env-spec/generate.ts` — execute `source = "generate"` shell commands, capture stdout.
- `packages/cli/src/lib/env-spec/files.ts` — execute `[files.*]` generators if target path is missing.
- `packages/cli/src/lib/env-spec/materialize.ts` — orchestrate parse + resolve + allocate + generate + files into a resolved variable map and per-context override maps.
- `packages/cli/src/lib/env-spec/emit.ts` — write `.env` (base) and `.env.<context>` files with the generated header.
- `packages/cli/src/lib/env-spec/index.ts` — public re-exports.
- Tests for each of the above (co-located `*.test.ts`).
- `packages/cli/src/commands/env.ts` — `crew env` parent command with `init`, `refresh`, `validate` subcommands.
- `packages/cli/src/commands/env.test.ts` — integration tests for the three subcommands.

**Modified:**

- `packages/cli/src/lib/docker/port-hash.ts` — keep the legacy fixed-shape function, add a generic per-key allocator alongside (or refactor `portHash` to delegate). Decided in Task 3.
- `packages/cli/src/lib/index.ts` — re-export the new `env-spec` module so commands can import from `../lib/index.js`.
- `packages/cli/src/index.ts` — register `envCommand`.
- `packages/cli/src/commands/run.ts` — when `env.toml` exists, materialize via the new pipeline before `runDockerEnv`. Backwards compat: when absent, fall through to existing behavior.
- `README.md` — add a "Project setup with `env.toml`" section + "Maintaining the schema" subsection.
- `docs/followups.md` — amend the `2026-04-30 — Unified crew init / crew doctor onboarding helper` entry to include `env.toml` scaffolding.

**Untouched (legacy path stays intact):**

- `packages/cli/src/lib/docker/env.ts` (`writeDockerEnv`, `GENERATED_ENV_HEADER`)
- `packages/cli/src/commands/docker-env.ts` (`crew docker-env` command)
- All `crew docker-env` callers

---

## Task 1: Schema types + parser

**Files:**

- Create: `packages/cli/src/lib/env-spec/types.ts`
- Create: `packages/cli/src/lib/env-spec/parse.ts`
- Create: `packages/cli/src/lib/env-spec/parse.test.ts`

The schema mirrors §"The `env.toml` contract" of the spec exactly. Schema version is gated to `1` (a const, exported so the no-crew script + future bumps share it).

- [ ] **Step 1: Write the failing parser test**

Create `packages/cli/src/lib/env-spec/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseEnvSpec } from './parse.js';

const minimal = `
schema = 1

[orchestration]
COMPOSE_PROJECT_NAME = { kind = "template", value = "\${BASE_NAME}-\${WORKTREE_ID}" }
HTTP_PORT = { kind = "port", default = 80 }

[app]
DATABASE_URL = { source = "literal", value = "postgres://localhost:5432/db" }
`;

describe('parseEnvSpec', () => {
  it('parses a minimal valid spec', () => {
    const spec = parseEnvSpec(minimal);
    expect(spec.schema).toBe(1);
    expect(spec.orchestration.COMPOSE_PROJECT_NAME).toEqual({
      kind: 'template',
      value: '${BASE_NAME}-${WORKTREE_ID}',
    });
    expect(spec.orchestration.HTTP_PORT).toEqual({ kind: 'port', default: 80 });
    expect(spec.app.DATABASE_URL).toEqual({
      source: 'literal',
      value: 'postgres://localhost:5432/db',
    });
    expect(spec.files).toEqual({});
    expect(spec.contexts).toEqual({});
  });

  it('rejects an unknown schema version', () => {
    expect(() => parseEnvSpec(`schema = 2\n[orchestration]\n[app]\n`)).toThrow(/schema/i);
  });

  it('rejects a missing schema field', () => {
    expect(() => parseEnvSpec(`[orchestration]\n[app]\n`)).toThrow(/schema/i);
  });

  it('rejects an unknown kind in orchestration', () => {
    const bad = `
schema = 1
[orchestration]
X = { kind = "weather", value = "sunny" }
[app]
`;
    expect(() => parseEnvSpec(bad)).toThrow(/kind/i);
  });

  it('rejects an unknown source in app', () => {
    const bad = `
schema = 1
[orchestration]
[app]
X = { source = "telepathy" }
`;
    expect(() => parseEnvSpec(bad)).toThrow(/source/i);
  });

  it('parses a [files.*] entry with optional env_var', () => {
    const withFiles = `
schema = 1
[orchestration]
[app]
[files.JWK]
path = "./secrets/jwk.pem"
generator = "openssl genpkey -algorithm RSA -out \${path}"
env_var = "JWK_PATH"
`;
    const spec = parseEnvSpec(withFiles);
    expect(spec.files.JWK).toEqual({
      path: './secrets/jwk.pem',
      generator: 'openssl genpkey -algorithm RSA -out ${path}',
      env_var: 'JWK_PATH',
    });
  });

  it('parses [contexts.*] override blocks', () => {
    const withCtx = `
schema = 1
[orchestration]
[app]
DATABASE_URL = { source = "literal", value = "postgres://localhost/db" }
[contexts.docker-backend]
DATABASE_URL = "postgres://postgres:5432/db"
`;
    const spec = parseEnvSpec(withCtx);
    expect(spec.contexts['docker-backend']).toEqual({
      DATABASE_URL: 'postgres://postgres:5432/db',
    });
  });

  it('rejects share = false on an entry without source = "generate"', () => {
    const bad = `
schema = 1
[orchestration]
[app]
X = { source = "literal", value = "x", share = false }
`;
    expect(() => parseEnvSpec(bad)).toThrow(/share/i);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /home/safturento/Repos/crew
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/parse.test.ts
```

Expected: FAIL — module `./parse.js` doesn't exist.

- [ ] **Step 3: Implement the schema types**

Create `packages/cli/src/lib/env-spec/types.ts`:

```ts
import { z } from 'zod';

export const ENV_SPEC_SCHEMA_VERSION = 1;

const orchestrationPort = z.object({
  kind: z.literal('port'),
  default: z.number().int().positive().optional(),
});

const orchestrationTemplate = z.object({
  kind: z.literal('template'),
  value: z.string(),
});

const orchestrationEntry = z.discriminatedUnion('kind', [orchestrationPort, orchestrationTemplate]);

const appLiteral = z.object({
  source: z.literal('literal'),
  value: z.string(),
});

const appGenerate = z.object({
  source: z.literal('generate'),
  command: z.string().min(1),
  share: z.boolean().optional(),
});

const appEntry = z
  .discriminatedUnion('source', [appLiteral, appGenerate])
  .superRefine((entry, ctx) => {
    if (entry.source === 'literal' && 'share' in entry) {
      ctx.addIssue({
        code: 'custom',
        message: 'share is only valid on entries with source = "generate"',
      });
    }
  });

const fileEntry = z.object({
  path: z.string().min(1),
  generator: z.string().min(1),
  env_var: z.string().min(1).optional(),
});

const contextOverrides = z.record(z.string(), z.string());

export const envSpecSchema = z.object({
  schema: z.literal(ENV_SPEC_SCHEMA_VERSION),
  orchestration: z.record(z.string(), orchestrationEntry).default({}),
  app: z.record(z.string(), appEntry).default({}),
  files: z.record(z.string(), fileEntry).default({}),
  contexts: z.record(z.string(), contextOverrides).default({}),
});

export type EnvSpec = z.infer<typeof envSpecSchema>;
export type OrchestrationEntry = z.infer<typeof orchestrationEntry>;
export type AppEntry = z.infer<typeof appEntry>;
export type FileEntry = z.infer<typeof fileEntry>;
```

The discriminated unions ensure that future schema additions (e.g. `kind = "free-port"` in schema 2) become a clean type extension rather than a string check.

- [ ] **Step 4: Implement the parser**

Create `packages/cli/src/lib/env-spec/parse.ts`:

```ts
import { readFileSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';
import { envSpecSchema, ENV_SPEC_SCHEMA_VERSION, type EnvSpec } from './types.js';

/**
 * Parse a raw env.toml string into a validated EnvSpec.
 * Throws on TOML syntax errors, schema-version mismatch, or shape violations.
 */
export function parseEnvSpec(raw: string): EnvSpec {
  let parsed: unknown;
  try {
    parsed = parseToml(raw);
  } catch (err) {
    throw new Error(`env.toml parse error: ${(err as Error).message}`);
  }

  const top = parsed as { schema?: unknown };
  if (top.schema === undefined) {
    throw new Error(
      `env.toml missing required \`schema\` field. This crew version supports schema = ${ENV_SPEC_SCHEMA_VERSION}.`,
    );
  }
  if (top.schema !== ENV_SPEC_SCHEMA_VERSION) {
    throw new Error(
      `env.toml schema = ${String(top.schema)} but this crew version only supports schema = ${ENV_SPEC_SCHEMA_VERSION}. Update crew or the spec.`,
    );
  }

  const result = envSpecSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    throw new Error(`env.toml validation failed:\n${issues}`);
  }
  return result.data;
}

/** Read and parse `env.toml` from the given absolute path. */
export function loadEnvSpec(path: string): EnvSpec {
  return parseEnvSpec(readFileSync(path, 'utf8'));
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/parse.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/env-spec/types.ts packages/cli/src/lib/env-spec/parse.ts packages/cli/src/lib/env-spec/parse.test.ts
git commit -m "feat(env-spec): TOML schema + parser with version gate"
```

---

## Task 2: DAG resolver for `${...}` substitution

**Files:**

- Create: `packages/cli/src/lib/env-spec/resolve.ts`
- Create: `packages/cli/src/lib/env-spec/resolve.test.ts`

This task implements substitution semantics §"Resolution semantics" of the spec. Pure functions — no I/O, no port allocation, no shell-out. Operates on the parsed spec + a _value map_ the materializer fills as it goes.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/lib/env-spec/resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  extractRefs,
  topoSortKeys,
  substitute,
  collectAllKeys,
  validateSpec,
  type ResolutionContext,
} from './resolve.js';
import type { EnvSpec } from './types.js';

describe('extractRefs', () => {
  it('finds ${VAR} references in a string', () => {
    expect(extractRefs('${A} and ${B}')).toEqual(['A', 'B']);
  });

  it('returns empty for strings with no refs', () => {
    expect(extractRefs('plain text')).toEqual([]);
  });

  it('does not double-count duplicate refs', () => {
    expect(extractRefs('${X} ${X}')).toEqual(['X']);
  });

  it('ignores escaped or malformed refs', () => {
    expect(extractRefs('$X plain $')).toEqual([]);
  });
});

describe('topoSortKeys', () => {
  it('orders keys so dependencies resolve first', () => {
    const deps = new Map<string, string[]>([
      ['C', ['B']],
      ['B', ['A']],
      ['A', []],
    ]);
    expect(topoSortKeys(deps)).toEqual(['A', 'B', 'C']);
  });

  it('throws on a cycle', () => {
    const deps = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['A']],
    ]);
    expect(() => topoSortKeys(deps)).toThrow(/cycle/i);
  });

  it('throws when a key references an unknown name', () => {
    const deps = new Map<string, string[]>([['A', ['MISSING']]]);
    expect(() => topoSortKeys(deps)).toThrow(/MISSING/);
  });
});

describe('substitute', () => {
  it('replaces all ${...} occurrences from the value map', () => {
    expect(substitute('${A}/${B}', { A: 'foo', B: 'bar' })).toBe('foo/bar');
  });

  it('throws when a referenced key is missing from the map', () => {
    expect(() => substitute('${A}', {})).toThrow(/A/);
  });
});

describe('collectAllKeys', () => {
  const spec: EnvSpec = {
    schema: 1,
    orchestration: {
      P: { kind: 'port', default: 80 },
      U: { kind: 'template', value: 'https://localhost:${P}' },
    },
    app: {
      D: { source: 'literal', value: '${U}/db' },
      S: { source: 'generate', command: 'echo s' },
    },
    files: {},
    contexts: {},
  };

  it('returns every declared key with its dependency list', () => {
    const ctx: ResolutionContext = { spec, builtins: ['BASE_NAME', 'WORKTREE_ID'] };
    const keys = collectAllKeys(ctx);
    expect(keys.get('P')).toEqual([]);
    expect(keys.get('U')).toEqual(['P']);
    expect(keys.get('D')).toEqual(['U']);
    expect(keys.get('S')).toEqual([]);
  });

  it('treats built-in keys as zero-dep nodes so refs to them resolve', () => {
    const specWithBuiltinRef: EnvSpec = {
      schema: 1,
      orchestration: { N: { kind: 'template', value: '${BASE_NAME}-x' } },
      app: {},
      files: {},
      contexts: {},
    };
    const ctx: ResolutionContext = {
      spec: specWithBuiltinRef,
      builtins: ['BASE_NAME', 'WORKTREE_ID'],
    };
    const keys = collectAllKeys(ctx);
    expect(keys.get('N')).toEqual(['BASE_NAME']);
    // Built-ins must appear as zero-dep nodes so topo-sort doesn't error on missing.
    expect(keys.get('BASE_NAME')).toEqual([]);
  });
});

describe('validateSpec', () => {
  it('passes a valid spec', () => {
    const spec: EnvSpec = {
      schema: 1,
      orchestration: {
        P: { kind: 'port', default: 80 },
        U: { kind: 'template', value: 'https://localhost:${P}' },
      },
      app: { D: { source: 'literal', value: '${U}/db' } },
      files: {},
      contexts: { docker: { D: 'postgres://${P}' } },
    };
    expect(() => validateSpec(spec)).not.toThrow();
  });

  it('throws on a cycle in templates/literals', () => {
    const spec: EnvSpec = {
      schema: 1,
      orchestration: {
        A: { kind: 'template', value: '${B}' },
        B: { kind: 'template', value: '${A}' },
      },
      app: {},
      files: {},
      contexts: {},
    };
    expect(() => validateSpec(spec)).toThrow(/cycle/i);
  });

  it('throws on an unknown ref in app literal', () => {
    const spec: EnvSpec = {
      schema: 1,
      orchestration: {},
      app: { X: { source: 'literal', value: '${MISSING}' } },
      files: {},
      contexts: {},
    };
    expect(() => validateSpec(spec)).toThrow(/MISSING/);
  });

  it('throws on an unknown ref in a context override', () => {
    const spec: EnvSpec = {
      schema: 1,
      orchestration: {},
      app: { X: { source: 'literal', value: 'a' } },
      files: {},
      contexts: { docker: { X: '${UNKNOWN}' } },
    };
    expect(() => validateSpec(spec)).toThrow(/UNKNOWN/);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/resolve.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement resolver**

Create `packages/cli/src/lib/env-spec/resolve.ts`:

```ts
import type { EnvSpec } from './types.js';

/** Match `${NAME}` where NAME is identifier-shaped. */
const REF_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Return the unique list of `${...}` reference names in `value`, in first-seen order. */
export function extractRefs(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of value.matchAll(REF_RE)) {
    const name = m[1];
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
    if (!(name in map)) {
      throw new Error(`env.toml: substitution failed — \`\${${name}}\` is not resolved`);
    }
    return map[name]!;
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
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/resolve.test.ts
```

Expected: all 15 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/env-spec/resolve.ts packages/cli/src/lib/env-spec/resolve.test.ts
git commit -m "feat(env-spec): DAG resolver for \${...} substitution"
```

---

## Task 3: Generic per-key port allocator

**Files:**

- Create: `packages/cli/src/lib/env-spec/allocate-port.ts`
- Create: `packages/cli/src/lib/env-spec/allocate-port.test.ts`

The existing `portHash(basename)` returns a fixed `{http, https, postgres}` shape — it can't service an `env.toml` that declares 5 ports with names the project picks. Generalize to "given (basename, varName), return one deterministic port in a non-conflicting range." Keep the existing `portHash` exported alongside the new function so legacy callers don't break.

The legacy shape is reproducible from the new function: `allocatePort(basename, 'CADDY_HTTP_PORT')` should return the same value that `portHash(basename).http` returned for the var named `CADDY_HTTP_PORT` — but only because we'll seed the allocator with a name-keyed offset. The legacy `portHash` keeps its three fixed offsets (HTTP_BASE/HTTPS_BASE/POSTGRES_BASE) so existing snapshot tests continue to pass.

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/env-spec/allocate-port.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { allocatePort } from './allocate-port.js';

describe('allocatePort', () => {
  it('is deterministic per (basename, varName) pair', () => {
    const a = allocatePort('Recipes-App-KAN-23', 'HTTP_PORT');
    const b = allocatePort('Recipes-App-KAN-23', 'HTTP_PORT');
    expect(a).toBe(b);
  });

  it('returns different ports for different var names on the same basename', () => {
    const http = allocatePort('Recipes-App-KAN-23', 'HTTP_PORT');
    const pg = allocatePort('Recipes-App-KAN-23', 'POSTGRES_PORT');
    expect(http).not.toBe(pg);
  });

  it('returns different ports for the same var name on different basenames', () => {
    const a = allocatePort('Recipes-App-KAN-23', 'HTTP_PORT');
    const b = allocatePort('Recipes-App-KAN-99', 'HTTP_PORT');
    expect(a).not.toBe(b);
  });

  it('falls inside the allocated 16384–32767 ephemeral-but-stable range', () => {
    const p = allocatePort('Recipes-App-KAN-23', 'WHATEVER');
    expect(p).toBeGreaterThanOrEqual(16384);
    expect(p).toBeLessThanOrEqual(32767);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/allocate-port.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement allocator**

Create `packages/cli/src/lib/env-spec/allocate-port.ts`:

```ts
import { createHash } from 'node:crypto';

/** Lower bound of the dynamic / private port range (RFC 6335). */
const RANGE_LOW = 16384;
const RANGE_SIZE = 32767 - RANGE_LOW + 1;

/**
 * Compute a deterministic port number for the (basename, varName) pair.
 * Used by the env.toml materialization pipeline when crew is generating a
 * spawned worktree's ports — the canonical worktree uses each entry's
 * `default` instead.
 *
 * The mapping is intentionally simple (md5 → mod RANGE_SIZE) — collisions
 * within one project are rare because varNames within one env.toml are
 * distinct and the basename is the worktree identifier. Cross-project
 * collisions are tolerable because each project runs in its own
 * COMPOSE_PROJECT_NAME and Docker network.
 */
export function allocatePort(basename: string, varName: string): number {
  const hashHex = createHash('md5').update(`${basename}::${varName}`).digest('hex').slice(0, 8);
  const offset = parseInt(hashHex, 16) % RANGE_SIZE;
  return RANGE_LOW + offset;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/allocate-port.test.ts
```

Expected: all 4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/env-spec/allocate-port.ts packages/cli/src/lib/env-spec/allocate-port.test.ts
git commit -m "feat(env-spec): generic per-key port allocator"
```

---

## Task 4: Source + file generators

**Files:**

- Create: `packages/cli/src/lib/env-spec/generate.ts`
- Create: `packages/cli/src/lib/env-spec/generate.test.ts`

One module covering both `source = "generate"` (run shell command, capture stdout) and `[files.*]` generators (run shell command if target file is missing). Both shell out via `node:child_process.execSync`, both trim stdout. Splitting them adds no value.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/lib/env-spec/generate.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGenerator, runFileGenerator } from './generate.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-gen-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runGenerator', () => {
  it('returns trimmed stdout from a shell command', () => {
    expect(runGenerator('echo hello')).toBe('hello');
  });

  it('throws with command + stderr context on non-zero exit', () => {
    expect(() => runGenerator('false')).toThrow(/exit/i);
  });
});

describe('runFileGenerator', () => {
  it('runs the generator and creates the file when path is missing', () => {
    const target = join(dir, 'made.txt');
    runFileGenerator({
      path: target,
      generator: `echo created > "\${path}"`,
      pathSubstitution: target,
    });
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, 'utf8').trim()).toBe('created');
  });

  it('does NOT re-run the generator when the file already exists', () => {
    const target = join(dir, 'cached.txt');
    writeFileSync(target, 'pre-existing\n');
    runFileGenerator({
      path: target,
      generator: `echo overwrite > "\${path}"`,
      pathSubstitution: target,
    });
    expect(readFileSync(target, 'utf8').trim()).toBe('pre-existing');
  });

  it('substitutes ${path} into the generator command', () => {
    const target = join(dir, 'substituted.txt');
    runFileGenerator({
      path: target,
      generator: 'printf "%s" "${path}" > "${path}"',
      pathSubstitution: target,
    });
    expect(readFileSync(target, 'utf8')).toBe(target);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/generate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement generators**

Create `packages/cli/src/lib/env-spec/generate.ts`:

```ts
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Execute a shell command and return its trimmed stdout. Used for
 * `source = "generate"` entries (e.g. `openssl rand -base64 32`).
 *
 * Errors include the exit code, stderr, and the command itself so a failing
 * generator is debuggable.
 */
export function runGenerator(command: string): string {
  try {
    const out = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.trim();
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer | string; message: string };
    const stderr = (e.stderr ?? '').toString().trim();
    throw new Error(
      `generator command failed (exit ${e.status ?? '?'}): \`${command}\`\n${stderr || e.message}`,
    );
  }
}

export interface RunFileGeneratorOptions {
  path: string;
  generator: string;
  /** What to substitute for ${path} in the generator command. Usually equal to `path`. */
  pathSubstitution: string;
}

/**
 * Run a `[files.*]` generator. Skips the generator entirely if `path` already
 * exists — file-generators are one-shot and cached on disk, not re-run on
 * every materialization.
 */
export function runFileGenerator(opts: RunFileGeneratorOptions): void {
  if (existsSync(opts.path)) return;
  mkdirSync(dirname(opts.path), { recursive: true });
  const cmd = opts.generator.replace(/\$\{path\}/g, opts.pathSubstitution);
  execSync(cmd, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (!existsSync(opts.path)) {
    throw new Error(
      `file generator did not produce expected path \`${opts.path}\` — check the generator command writes there.`,
    );
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/generate.test.ts
```

Expected: all 5 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/env-spec/generate.ts packages/cli/src/lib/env-spec/generate.test.ts
git commit -m "feat(env-spec): shell-out generators for sources and files"
```

---

## Task 5: Materialization pipeline

**Files:**

- Create: `packages/cli/src/lib/env-spec/materialize.ts`
- Create: `packages/cli/src/lib/env-spec/materialize.test.ts`

The integration point. Reads the existing `.env` (cache for idempotency), resolves orchestration, then app, then runs file generators, then assembles the per-context override maps. Returns the resolved values + override maps; the _emitter_ in Task 6 writes them to disk. Splitting these concerns means materialize is testable without touching the filesystem-as-output (only the cache read), and emit is a thin printer.

The "is this the canonical worktree?" decision lives outside this module — passed in via options. That keeps materialize free of cwd / config-file lookups, which the CLI command does.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/lib/env-spec/materialize.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materialize, type MaterializeOptions } from './materialize.js';
import { parseEnvSpec } from './parse.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-mat-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const baseSpec = `
schema = 1

[orchestration]
COMPOSE_PROJECT_NAME = { kind = "template", value = "\${BASE_NAME}-\${WORKTREE_ID}" }
HTTP_PORT  = { kind = "port", default = 80 }
HTTPS_PORT = { kind = "port", default = 443 }
APP_URL    = { kind = "template", value = "https://localhost:\${HTTPS_PORT}" }

[app]
DATABASE_URL = { source = "literal",  value = "postgres://localhost:\${HTTP_PORT}/db" }
SECRET       = { source = "generate", command = "echo deterministic-secret" }
CORS_ORIGIN  = { source = "literal",  value = "\${APP_URL}" }

[contexts.docker-backend]
DATABASE_URL = "postgres://postgres:5432/db"
`;

const opts = (overrides: Partial<MaterializeOptions> = {}): MaterializeOptions => ({
  baseName: 'recipes',
  worktreeId: 'main',
  worktreeBasename: 'recipes',
  isCanonical: true,
  cacheEnv: {},
  canonicalEnv: undefined,
  ...overrides,
});

describe('materialize', () => {
  it('resolves all four section types into a base map and per-context overrides', () => {
    const spec = parseEnvSpec(baseSpec);
    const result = materialize(spec, opts());

    expect(result.base.COMPOSE_PROJECT_NAME).toBe('recipes-main');
    expect(result.base.HTTP_PORT).toBe('80');
    expect(result.base.HTTPS_PORT).toBe('443');
    expect(result.base.APP_URL).toBe('https://localhost:443');
    expect(result.base.DATABASE_URL).toBe('postgres://localhost:80/db');
    expect(result.base.SECRET).toBe('deterministic-secret');
    expect(result.base.CORS_ORIGIN).toBe('https://localhost:443');
    expect(result.contexts['docker-backend']).toEqual({
      DATABASE_URL: 'postgres://postgres:5432/db',
    });
  });

  it('uses default for canonical port slots and allocator for non-canonical', () => {
    const spec = parseEnvSpec(baseSpec);

    const canon = materialize(spec, opts());
    expect(canon.base.HTTP_PORT).toBe('80');

    const spawn = materialize(
      spec,
      opts({ isCanonical: false, worktreeId: 'kan-23', worktreeBasename: 'recipes-kan-23' }),
    );
    expect(spawn.base.HTTP_PORT).not.toBe('80');
    expect(parseInt(spawn.base.HTTP_PORT, 10)).toBeGreaterThanOrEqual(16384);
  });

  it('preserves cached values for source = "generate" (idempotency)', () => {
    const spec = parseEnvSpec(baseSpec);
    const result = materialize(spec, opts({ cacheEnv: { SECRET: 'cached-value' } }));
    expect(result.base.SECRET).toBe('cached-value');
  });

  it('shares source = "generate" from canonical .env when not canonical', () => {
    const spec = parseEnvSpec(baseSpec);
    const result = materialize(
      spec,
      opts({
        isCanonical: false,
        worktreeId: 'kan-23',
        worktreeBasename: 'recipes-kan-23',
        canonicalEnv: { SECRET: 'from-canonical' },
      }),
    );
    expect(result.base.SECRET).toBe('from-canonical');
  });

  it('opts out of sharing when share = false on the entry', () => {
    const specSrc = baseSpec.replace(
      'SECRET       = { source = "generate", command = "echo deterministic-secret" }',
      'SECRET       = { source = "generate", command = "echo deterministic-secret", share = false }',
    );
    const spec = parseEnvSpec(specSrc);
    const result = materialize(
      spec,
      opts({
        isCanonical: false,
        worktreeId: 'kan-23',
        worktreeBasename: 'recipes-kan-23',
        canonicalEnv: { SECRET: 'should-not-share' },
      }),
    );
    expect(result.base.SECRET).toBe('deterministic-secret');
  });

  it('runs file generators and exposes the path under env_var when set', () => {
    const target = join(dir, 'jwk.pem');
    const fileSpec = `
schema = 1
[orchestration]
[app]
[files.JWK]
path      = "${target.replaceAll('\\', '/')}"
generator = "echo --- > \${path}"
env_var   = "JWK_PATH"
`;
    const spec = parseEnvSpec(fileSpec);
    const result = materialize(spec, opts());
    expect(result.base.JWK_PATH).toBe(target);
  });

  it('throws on a cycle in templates', () => {
    const cycle = `
schema = 1
[orchestration]
A = { kind = "template", value = "\${B}" }
B = { kind = "template", value = "\${A}" }
[app]
`;
    const spec = parseEnvSpec(cycle);
    expect(() => materialize(spec, opts())).toThrow(/cycle/i);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/materialize.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement materialize**

Create `packages/cli/src/lib/env-spec/materialize.ts`:

```ts
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
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/materialize.test.ts
```

Expected: all 7 pass. (Cycle test fails earlier at parse time? No — parse only does shape validation; cycles surface in `collectAllKeys → topoSortKeys`.)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/env-spec/materialize.ts packages/cli/src/lib/env-spec/materialize.test.ts
git commit -m "feat(env-spec): materialization pipeline (resolve + cache + share)"
```

---

## Task 6: Env-file emitter

**Files:**

- Create: `packages/cli/src/lib/env-spec/emit.ts`
- Create: `packages/cli/src/lib/env-spec/emit.test.ts`
- Create: `packages/cli/src/lib/env-spec/parse-env-file.ts`
- Create: `packages/cli/src/lib/env-spec/parse-env-file.test.ts`
- Create: `packages/cli/src/lib/env-spec/index.ts`

Two pure-IO helpers. The emitter writes `.env` (with the same `GENERATED_ENV_HEADER` as `writeDockerEnv` so the legacy `crew docker-env` clobber-protection still applies) plus one `.env.<context>` per context. The parser reads an existing `.env` into a flat `Record<string, string>` for the materialize cache.

- [ ] **Step 1: Write failing parse-env-file tests**

Create `packages/cli/src/lib/env-spec/parse-env-file.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseEnvFile } from './parse-env-file.js';

describe('parseEnvFile', () => {
  it('parses KEY=VALUE pairs', () => {
    expect(parseEnvFile('A=1\nB=two\n')).toEqual({ A: '1', B: 'two' });
  });

  it('skips comment and blank lines', () => {
    expect(parseEnvFile('# header\n\nA=1\n')).toEqual({ A: '1' });
  });

  it('preserves equals signs in values', () => {
    expect(parseEnvFile('TOKEN=abc=def==\n')).toEqual({ TOKEN: 'abc=def==' });
  });

  it('returns empty for an empty file', () => {
    expect(parseEnvFile('')).toEqual({});
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/parse-env-file.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement parse-env-file**

Create `packages/cli/src/lib/env-spec/parse-env-file.ts`:

```ts
/**
 * Minimal `.env` file parser — KEY=VALUE per line, skipping `#` comments
 * and blank lines. Used to read an existing `.env` into a cache map for
 * materialize idempotency. NOT a general-purpose dotenv loader; values are
 * preserved verbatim (no quoting, no escapes) because we wrote them ourselves.
 */
export function parseEnvFile(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (key) out[key] = value;
  }
  return out;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/parse-env-file.test.ts
```

Expected: all 4 pass.

- [ ] **Step 5: Write failing emit tests**

Create `packages/cli/src/lib/env-spec/emit.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emit, GENERATED_ENV_HEADER } from './emit.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-emit-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('emit', () => {
  it('writes .env with the generated header followed by sorted KEY=VALUE pairs', () => {
    emit({
      worktreeRoot: dir,
      base: { B_KEY: '2', A_KEY: '1' },
      contexts: {},
    });
    const content = readFileSync(join(dir, '.env'), 'utf8');
    expect(content.startsWith(GENERATED_ENV_HEADER)).toBe(true);
    expect(content.indexOf('A_KEY=1')).toBeLessThan(content.indexOf('B_KEY=2'));
  });

  it('writes one .env.<context> per context block', () => {
    emit({
      worktreeRoot: dir,
      base: { X: 'x' },
      contexts: { 'docker-backend': { Y: 'y' }, prod: { Z: 'z' } },
    });
    expect(readFileSync(join(dir, '.env.docker-backend'), 'utf8')).toContain('Y=y');
    expect(readFileSync(join(dir, '.env.prod'), 'utf8')).toContain('Z=z');
  });

  it('refuses to overwrite a .env without the generated header', () => {
    writeFileSync(join(dir, '.env'), 'HAND_EDITED=1\n');
    expect(() => emit({ worktreeRoot: dir, base: { X: 'x' }, contexts: {} })).toThrow(
      /not generated by crew/i,
    );
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('HAND_EDITED=1\n');
  });

  it('overwrites a .env that has the generated header', () => {
    writeFileSync(join(dir, '.env'), `${GENERATED_ENV_HEADER}\nOLD=1\n`);
    emit({ worktreeRoot: dir, base: { NEW: 'new' }, contexts: {} });
    const content = readFileSync(join(dir, '.env'), 'utf8');
    expect(content).not.toContain('OLD=1');
    expect(content).toContain('NEW=new');
  });
});
```

- [ ] **Step 6: Run, expect failure**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/emit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement emit**

Create `packages/cli/src/lib/env-spec/emit.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const GENERATED_ENV_HEADER =
  '# Generated by crew — re-run `crew env init` (canonical) or `crew env refresh` to regenerate.';

export interface EmitOptions {
  /** Worktree root directory. `.env` and `.env.<context>` files are written here. */
  worktreeRoot: string;
  /** Variables for the base .env. */
  base: Record<string, string>;
  /** Per-context override files. */
  contexts: Record<string, Record<string, string>>;
}

function refuseIfHandEdited(path: string): void {
  if (!existsSync(path)) return;
  const existing = readFileSync(path, 'utf8');
  if (!existing.startsWith(GENERATED_ENV_HEADER)) {
    throw new Error(
      `emit: ${path} exists and was not generated by crew. ` +
        `Move it aside (e.g. mv ${path} ${path}.bak) to regenerate.`,
    );
  }
}

function render(map: Record<string, string>): string {
  const keys = Object.keys(map).sort();
  return [GENERATED_ENV_HEADER, ...keys.map((k) => `${k}=${map[k]}`), ''].join('\n');
}

export function emit(opts: EmitOptions): void {
  const baseEnvPath = join(opts.worktreeRoot, '.env');
  refuseIfHandEdited(baseEnvPath);
  for (const ctxName of Object.keys(opts.contexts)) {
    refuseIfHandEdited(join(opts.worktreeRoot, `.env.${ctxName}`));
  }

  writeFileSync(baseEnvPath, render(opts.base));
  for (const [ctxName, vars] of Object.entries(opts.contexts)) {
    writeFileSync(join(opts.worktreeRoot, `.env.${ctxName}`), render(vars));
  }
}
```

- [ ] **Step 8: Run all env-spec tests, expect pass**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/env-spec/
```

Expected: all tests across the module pass.

- [ ] **Step 9: Add the public re-export barrel**

Create `packages/cli/src/lib/env-spec/index.ts`:

```ts
export { parseEnvSpec, loadEnvSpec } from './parse.js';
export { materialize } from './materialize.js';
export { validateSpec } from './resolve.js';
export { emit, GENERATED_ENV_HEADER as ENV_SPEC_GENERATED_HEADER } from './emit.js';
export { parseEnvFile } from './parse-env-file.js';
export type { EnvSpec, OrchestrationEntry, AppEntry, FileEntry } from './types.js';
export type { MaterializeOptions, MaterializeResult } from './materialize.js';
export type { EmitOptions } from './emit.js';
export { ENV_SPEC_SCHEMA_VERSION } from './types.js';
```

- [ ] **Step 10: Re-export from `packages/cli/src/lib/index.ts`**

Locate the existing barrel exports in `packages/cli/src/lib/index.ts` and append:

```ts
export * from './env-spec/index.js';
```

- [ ] **Step 11: Commit**

```bash
git add packages/cli/src/lib/env-spec/
git add packages/cli/src/lib/index.ts
git commit -m "feat(env-spec): emitter + .env parser + module barrel"
```

---

## Task 7: `crew env` command surface (init / refresh / validate)

**Files:**

- Create: `packages/cli/src/commands/env.ts`
- Create: `packages/cli/src/commands/env.test.ts`
- Modify: `packages/cli/src/index.ts` (register the new command)

One file, one parent `commander` command with three subcommands. The actions share the shape: discover `env.toml`, load + parse, build `MaterializeOptions` from the worktree, run `materialize`, run `emit`. `validate` short-circuits before `materialize` (parse + DAG check only).

`init` is run on a canonical worktree (sets `isCanonical = true`); `refresh` is run on whatever worktree the user is sitting in (canonical-detection from project config). The `--canonical-worktree-name <name>` flag in env.toml's host project lives in `~/.config/crew/projects/<name>.toml` — we already have `discoverProjectConfig(cwd)` for this.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/commands/env.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEnvInit, runEnvRefresh, runEnvValidate } from './env.js';
import type { ProjectConfig } from '../lib/index.js';

let dir: string;

const SPEC = `
schema = 1
[orchestration]
COMPOSE_PROJECT_NAME = { kind = "template", value = "\${BASE_NAME}-\${WORKTREE_ID}" }
HTTP_PORT = { kind = "port", default = 80 }
[app]
SECRET = { source = "generate", command = "echo deterministic" }
[contexts.docker-backend]
HTTP_PORT = "5555"
`;

const stubConfig = (canonical: string): ProjectConfig =>
  ({
    name: 'test',
    repo_path: dir,
    default_branch: 'main',
    jira: { project_key: 'KAN', site: 'https://x.atlassian.net' },
    github: { repo: 'x/y' },
    docker: {
      canonical_worktree: canonical,
      http_port_base: 8000,
      https_port_base: 8400,
      postgres_port_base: 15400,
    },
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    },
  }) as ProjectConfig;

function makeWorktree(name: string): string {
  const wt = join(dir, name);
  mkdirSync(wt, { recursive: true });
  writeFileSync(join(wt, 'env.toml'), SPEC);
  return wt;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-envcmd-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runEnvInit', () => {
  it('writes .env and per-context files using canonical defaults', async () => {
    const wt = makeWorktree('test-canonical');
    const result = await runEnvInit({
      worktree: wt,
      config: stubConfig('test-canonical'),
      log: () => {},
    });
    expect(result.ok).toBe(true);
    expect(readFileSync(join(wt, '.env'), 'utf8')).toMatch(/HTTP_PORT=80/);
    expect(readFileSync(join(wt, '.env'), 'utf8')).toMatch(/SECRET=deterministic/);
    expect(readFileSync(join(wt, '.env.docker-backend'), 'utf8')).toMatch(/HTTP_PORT=5555/);
  });

  it('uses allocator for non-canonical worktree', async () => {
    const wt = makeWorktree('test-canonical-kan-23');
    await runEnvInit({
      worktree: wt,
      config: stubConfig('test-canonical'),
      log: () => {},
    });
    const content = readFileSync(join(wt, '.env'), 'utf8');
    expect(content).not.toMatch(/HTTP_PORT=80\b/);
  });

  it('returns ok=false when env.toml is missing', async () => {
    const wt = join(dir, 'no-spec');
    mkdirSync(wt, { recursive: true });
    const result = await runEnvInit({
      worktree: wt,
      config: stubConfig('no-spec'),
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/env\.toml/);
  });
});

describe('runEnvRefresh', () => {
  it('preserves cached generated values across re-runs', async () => {
    const wt = makeWorktree('test-canonical');
    await runEnvInit({ worktree: wt, config: stubConfig('test-canonical'), log: () => {} });
    const first = readFileSync(join(wt, '.env'), 'utf8').match(/SECRET=(.*)/)?.[1];

    // Mutate cache to a different value, then refresh: refresh must keep the cache.
    const swapped = readFileSync(join(wt, '.env'), 'utf8').replace(
      /SECRET=.*/,
      'SECRET=user-set-value',
    );
    writeFileSync(join(wt, '.env'), swapped);

    await runEnvRefresh({ worktree: wt, config: stubConfig('test-canonical'), log: () => {} });
    const second = readFileSync(join(wt, '.env'), 'utf8').match(/SECRET=(.*)/)?.[1];
    expect(second).toBe('user-set-value');
    expect(second).not.toBe(first);
  });
});

describe('runEnvValidate', () => {
  it('returns ok=true on a valid spec', async () => {
    const wt = makeWorktree('test-canonical');
    const result = await runEnvValidate({ worktree: wt, log: () => {} });
    expect(result.ok).toBe(true);
  });

  it('returns ok=false with reason on a parse error', async () => {
    const wt = makeWorktree('test-canonical');
    writeFileSync(join(wt, 'env.toml'), 'schema = 999\n');
    const result = await runEnvValidate({ worktree: wt, log: () => {} });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/schema/i);
  });

  it('returns ok=false with reason on a cycle', async () => {
    const wt = makeWorktree('test-canonical');
    writeFileSync(
      join(wt, 'env.toml'),
      `
schema = 1
[orchestration]
A = { kind = "template", value = "\${B}" }
B = { kind = "template", value = "\${A}" }
[app]
`,
    );
    const result = await runEnvValidate({ worktree: wt, log: () => {} });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/cycle/i);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm run test:run --workspace=cli -- packages/cli/src/commands/env.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the env command**

Create `packages/cli/src/commands/env.ts`:

```ts
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
  // Canonical worktree is a sibling directory by convention (`<canonical>` next to `<canonical>-kan-23`).
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
    // Side-effect-free: build DAG + topo-sort + substitution-check, no generators run.
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
```

- [ ] **Step 4: Register in `packages/cli/src/index.ts`**

Add the import + `program.addCommand(envCommand);` near the existing `dockerEnvCommand` registration:

```ts
import { envCommand } from './commands/env.js';
// ...
program.addCommand(envCommand);
```

- [ ] **Step 5: Run all tests, expect pass**

```bash
npm run test:run --workspace=cli
```

Expected: all suites pass, including the existing legacy `docker-env` tests (untouched) and the new `env.test.ts` (12 tests).

- [ ] **Step 6: Manual smoke test**

In a temp directory with a minimal `env.toml` and a `~/.config/crew/projects/<name>.toml` pointing at it:

```bash
cd $(mktemp -d) && mkdir my-project && cd my-project
git init -q
cat > env.toml <<'EOF'
schema = 1
[orchestration]
COMPOSE_PROJECT_NAME = { kind = "template", value = "${BASE_NAME}-${WORKTREE_ID}" }
HTTP_PORT = { kind = "port", default = 8080 }
[app]
SECRET = { source = "generate", command = "openssl rand -hex 16" }
EOF
# Set up a stub crew config — see next step.
```

Skip if a stub config is more work than its worth manually; the integration test in Step 1 covers the same path.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/env.ts packages/cli/src/commands/env.test.ts packages/cli/src/index.ts
git commit -m "feat(env): crew env init/refresh/validate subcommands"
```

---

## Task 8: Wire `env.toml` detection into `crew run`

**Files:**

- Modify: `packages/cli/src/commands/run.ts` (the worktree-bringup path)
- Modify: `packages/cli/src/commands/run.test.ts`

`crew run` already calls `writeDockerEnv` somewhere in the worktree setup path. The new behavior: if the project's repo root has `env.toml`, run the new pipeline (`materialize` + `emit`) on the new worktree dir. If not, fall through to the legacy `writeDockerEnv` path. This is the migration ramp — projects opt in by adding `env.toml`.

The exact insertion point depends on `run.ts`'s current structure. Read the file and locate the `writeDockerEnv` call before writing the change.

- [ ] **Step 1: Locate the existing `writeDockerEnv` call in `run.ts`**

```bash
grep -n "writeDockerEnv\|runDockerEnv" packages/cli/src/commands/run.ts
```

Note the line. The change wraps that call.

- [ ] **Step 2: Write the failing test**

Append to `packages/cli/src/commands/run.test.ts`:

```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('crew run + env.toml', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'crew-run-env-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses the env-spec pipeline when env.toml exists at the canonical worktree root', async () => {
    // Arrange a canonical worktree with env.toml.
    const canonical = join(dir, 'fake-project');
    mkdirSync(canonical);
    writeFileSync(
      join(canonical, 'env.toml'),
      `
schema = 1
[orchestration]
COMPOSE_PROJECT_NAME = { kind = "template", value = "\${BASE_NAME}-\${WORKTREE_ID}" }
HTTP_PORT = { kind = "port", default = 80 }
[app]
SECRET = { source = "literal", value = "static" }
`,
    );

    // The test calls the *internal helper* `bringUpWorktreeEnv` extracted from runCommand.
    // (Step 4 below extracts that helper so it's testable in isolation.)
    const { bringUpWorktreeEnv } = await import('./run.js');
    const result = await bringUpWorktreeEnv({
      worktree: canonical,
      canonicalWorktreeName: 'fake-project',
      projectName: 'fake-project',
    });

    expect(result.kind).toBe('env-spec');
    expect(existsSync(join(canonical, '.env'))).toBe(true);
    expect(readFileSync(join(canonical, '.env'), 'utf8')).toMatch(/SECRET=static/);
  });

  it('falls back to writeDockerEnv when env.toml is absent', async () => {
    const canonical = join(dir, 'legacy-project');
    mkdirSync(canonical);

    const { bringUpWorktreeEnv } = await import('./run.js');
    const result = await bringUpWorktreeEnv({
      worktree: canonical,
      canonicalWorktreeName: 'legacy-project',
      projectName: 'legacy-project',
    });

    expect(result.kind).toBe('legacy');
    expect(readFileSync(join(canonical, '.env'), 'utf8')).toMatch(/^# Generated by crew/);
    expect(readFileSync(join(canonical, '.env'), 'utf8')).toMatch(/COMPOSE_PROJECT_NAME=/);
  });
});
```

- [ ] **Step 3: Run, expect failure**

```bash
npm run test:run --workspace=cli -- packages/cli/src/commands/run.test.ts
```

Expected: FAIL — `bringUpWorktreeEnv` is not exported.

- [ ] **Step 4: Extract `bringUpWorktreeEnv` from `run.ts`**

Locate the existing `writeDockerEnv` call in `packages/cli/src/commands/run.ts`. Refactor that block into a separate exported function:

```ts
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { loadEnvSpec, materialize, emit, parseEnvFile, writeDockerEnv } from '../lib/index.js';

export interface BringUpWorktreeEnvOpts {
  worktree: string;
  canonicalWorktreeName: string;
  projectName: string;
}

export type BringUpWorktreeEnvResult = { kind: 'env-spec' } | { kind: 'legacy' };

/**
 * Materialize per-worktree env files. Uses env.toml when present at the
 * worktree root, else falls back to the legacy fixed-shape writeDockerEnv.
 *
 * Lives here (rather than under lib/) because the legacy-vs-new branching is
 * a `crew run` concern, not a generic library responsibility.
 */
export async function bringUpWorktreeEnv(
  opts: BringUpWorktreeEnvOpts,
): Promise<BringUpWorktreeEnvResult> {
  const specPath = join(opts.worktree, 'env.toml');
  if (existsSync(specPath)) {
    const spec = loadEnvSpec(specPath);
    const wtBasename = basename(opts.worktree);
    const isCanonical = wtBasename === opts.canonicalWorktreeName;
    const cacheEnv = existsSync(join(opts.worktree, '.env'))
      ? parseEnvFile(readFileSync(join(opts.worktree, '.env'), 'utf8'))
      : {};
    const result = materialize(spec, {
      baseName: opts.projectName,
      worktreeId: isCanonical ? 'main' : wtBasename.replace(`${opts.canonicalWorktreeName}-`, ''),
      worktreeBasename: wtBasename,
      isCanonical,
      cacheEnv,
      canonicalEnv: undefined, // run.ts dispatches the canonical-share read elsewhere if needed
    });
    emit({ worktreeRoot: opts.worktree, base: result.base, contexts: result.contexts });
    return { kind: 'env-spec' };
  }

  writeDockerEnv(opts.worktree, { canonicalWorktree: opts.canonicalWorktreeName });
  return { kind: 'legacy' };
}
```

Replace the existing `writeDockerEnv` call site in `runCommand` with `await bringUpWorktreeEnv({ worktree, canonicalWorktreeName, projectName })`. Keep the surrounding logging. The full import block at the top of `run.ts` (modify what's already there) should look like:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { loadEnvSpec, materialize, emit, parseEnvFile, writeDockerEnv } from '../lib/index.js';
```

- [ ] **Step 5: Run, expect pass**

```bash
npm run test:run --workspace=cli -- packages/cli/src/commands/run.test.ts
```

Expected: existing tests + 2 new tests pass.

- [ ] **Step 6: Run full test suite to catch unrelated regressions**

```bash
npm run test:run --workspace=cli
```

Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/run.ts packages/cli/src/commands/run.test.ts
git commit -m "feat(run): use env.toml pipeline when present, else legacy writeDockerEnv"
```

---

## Task 9: Documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/followups.md`

Two surfaces: the README gets a permanent "Project setup with `env.toml`" section, and the existing setup-wizard followup gets amended.

- [ ] **Step 1: Add the README section**

After the "Setup → Playwright (per project, optional)" subsection in `README.md`, add a new top-level section before "Usage" (or wherever the next H2 is — locate it first with `grep -n "^## " README.md | head -15`):

````markdown
## Project setup with `env.toml`

Projects can ship a declarative `env.toml` at their repo root that describes the env vars + generated files they need. Crew materializes per-worktree `.env` (and per-context override files) from the spec. The same spec can be consumed by a project-side bundled script for users who don't have crew installed (canonical-worktree path only).

Skip this section for projects without `env.toml` — they continue to use the legacy `crew docker-env` (fixed-shape `COMPOSE_PROJECT_NAME` + 3 ports) which `crew run` falls back to automatically.

### Schema

```toml
schema = 1   # gates compatibility; bump only with a corresponding crew change

# Per-worktree, mutated when crew spawns a worktree.
# Two `kind`s: "port" and "template".
[orchestration]
COMPOSE_PROJECT_NAME = { kind = "template", value = "${BASE_NAME}-${WORKTREE_ID}" }
CADDY_HTTP_PORT      = { kind = "port", default = 80 }
CADDY_HTTPS_PORT     = { kind = "port", default = 443 }
APP_URL              = { kind = "template", value = "https://localhost:${CADDY_HTTPS_PORT}" }

# Project-wide, set once per project.
# Two `source`s: "literal" and "generate".
[app]
DATABASE_URL       = { source = "literal",  value = "postgres://..." }
BETTER_AUTH_SECRET = { source = "generate", command = "openssl rand -base64 32" }

# Files materialized once per worktree (or per project, if path is shared).
[files.JWK_PRIVATE_KEY]
path      = "./secrets/jwk.pem"
generator = "openssl genpkey -algorithm RSA -out ${path}"
env_var   = "JWK_PRIVATE_KEY_PATH"   # optional: exposes ${path} as this env var

# Per-runtime-context overrides. Each emits a separate .env.<context> file.
[contexts.docker-backend]
DATABASE_URL = "postgres://...@postgres:5432/db"
```

`${BASE_NAME}` (project canonical name) and `${WORKTREE_ID}` (`main` for canonical, the worktree's directory suffix otherwise) are built-ins. References are resolved as a DAG; cycles error.

### Materialization rules

- **Orchestration**: ports use `default` for the canonical worktree, allocator-derived per-worktree values otherwise. Templates substitute previously-resolved values.
- **App**: literals substitute. `source = "generate"` runs `command` once and caches the value in `.env`; non-canonical worktrees copy from the canonical worktree's `.env` by default. Opt out with `share = false`.
- **Files**: `generator` runs only if `path` is missing on disk. `${path}` is substituted into the command. `env_var` (optional) exposes the path as that env var.
- **Contexts**: each `[contexts.<name>]` block emits a `.env.<name>` file containing only its overrides. Compose's `env_file:` list applies them on top of `.env` (later files win).

### Commands

- `crew env init` — materialize `.env` from `env.toml` in the current worktree (canonical or fresh).
- `crew env refresh` — re-materialize after editing `env.toml`. Preserves cached generated values.
- `crew env validate` — schema-check `env.toml` without writing anything. Exit non-zero on cycles or unknown schema.

### Maintaining the schema

Most env-spec work is done by agents. When extending the schema, **all** of the following must be updated together; treat the list as a verification checklist:

1. Bump `ENV_SPEC_SCHEMA_VERSION` in `packages/cli/src/lib/env-spec/types.ts`.
2. Update the Zod schema in the same file to accept new `kind`, `source`, or section types.
3. Update `packages/cli/src/lib/env-spec/resolve.ts` if new entry types affect dependency extraction.
4. Update `packages/cli/src/lib/env-spec/materialize.ts` to handle new resolution rules.
5. Update this README section (schema example + materialization rules).
6. **Update each project's bundled `scripts/setup.mjs`** so it accepts the new schema version. If the new operator is crew-only (e.g., a future `kind = "free-port"` requiring allocation), the script must reject the new schema version with a clear error rather than silently skip.
7. Bump `schema = N` in each project's `env.toml` once the new crew version is released and the project's bundled script has been updated.
8. Add tests in `env-spec/*.test.ts` covering the new behavior.
9. Update the inputs to `crew env validate` if any new validation rules apply.

The schema-version field is the contract; if any of the steps above are skipped, validation will surface the mismatch but the materializer may produce surprising output.
````

- [ ] **Step 2: Amend the setup-wizard followup**

Edit `docs/followups.md` line 296–301 (the `2026-04-30 — Unified crew init / crew doctor onboarding helper` entry). Insert a new bullet under "**New project**" between the existing "walk through writing the TOML" and "run `npm install -D @playwright/test`":

```markdown
- **New project**: walk through writing the TOML, **scaffold an `env.toml` at the project repo root** (prompt for orchestration ports, app vars, contexts; populate sensible defaults), run `npm install -D @playwright/test` if Playwright is opted in, scaffold `playwright.config.ts` + `tests/e2e/` skeleton, scaffold Bruno collection skeleton if opted in.
```

The single-line edit captures the dependency on env.toml being part of the wizard surface — the wizard now writes both the user-config TOML at `~/.config/crew/projects/<name>.toml` and the project-config `env.toml` at the repo root.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/followups.md
git commit -m "docs: env.toml schema + maintenance + setup-wizard followup amendment"
```

---

## Final verification

- [ ] **Step 1: Run the full crew test suite**

```bash
npm run test:run
```

Expected: all packages green.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Spot-check the docker-env legacy path is unchanged**

```bash
git diff main packages/cli/src/lib/docker/env.ts packages/cli/src/lib/docker/env.test.ts packages/cli/src/commands/docker-env.ts
```

Expected: no changes (the new pipeline is additive; legacy callers untouched).

- [ ] **Step 4: Verify the new module's external surface is what we promised**

```bash
node -e "import('./packages/cli/src/lib/env-spec/index.js').then(m => console.log(Object.keys(m).sort()))"
```

Expected: `parseEnvSpec`, `loadEnvSpec`, `materialize`, `emit`, `parseEnvFile`, `ENV_SPEC_GENERATED_HEADER`, `ENV_SPEC_SCHEMA_VERSION`.

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin <your-branch>
gh pr create --title "feat: env.toml materialization pipeline" --body "..."
```

The PR description should reference both the spec (Recipes #41) and the Recipes-side counterpart plan, and call out the backwards-compat behavior for projects without `env.toml`.
