# Bruno API Smoke Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a Bruno-driven HTTP smoke check into crew-dispatched agents per project, opt-in via TOML, so agents (a) run `npm run bruno:smoke` as part of verification before claiming done and (b) keep `.bru` files in sync when endpoints change.

**Architecture:** Per-project TOML opt-in (`[bruno_smoke]`) drives four runtime effects in `crew run` and `crew fix-pr`: a generated per-worktree Bruno environment file in `<worktree>/<collection_dir>/environments/<envName>.bru`, a `CREW_BRUNO_ENV=<envName>` export in the agent's spawn env, a docker-lifecycle change so the stack stays running for the agent (composed with `[visual_testing]`), and a conditional prompt fragment in both the ticket and fix-pr templates instructing the agent. Target repos own their Bruno collection + `npm run bruno:smoke` script; crew validates the contract and fails fast on missing prereqs.

**Tech Stack:** TypeScript, Zod schemas, Vitest, smol-toml, npm workspaces. Existing crew CLI + per-project TOML at `~/.config/crew/projects/<name>.toml`. Reuses `resolveAppUrl` from `packages/cli/src/lib/visual-testing/`.

**Source spec:** [`docs/superpowers/specs/2026-04-29-bruno-smoke-tests-design.md`](../specs/2026-04-29-bruno-smoke-tests-design.md). Read it before starting.

**Ticket carve-up** (one Epic + 3 child tickets in CREW + 1 off-repo skill ticket + 2 independent prereq tickets in target repos):

| Ticket                           | Tasks                                                       | Blocks                                                               |
| -------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| **CREW-bruno-α** (foundation)    | Tasks 1-9                                                   | Blocks β, γ                                                          |
| **CREW-bruno-β** (ticket prompt) | Tasks 10-12                                                 | After α; parallel with γ + skill                                     |
| **CREW-bruno-γ** (fix-pr prompt) | Tasks 13-16                                                 | After α; parallel with β + skill                                     |
| **CREW-bruno-skill** (off-repo)  | Task 17                                                     | Independent — can run any time                                       |
| (KAN-prereq)                     | Bruno collection for Recipes + `npm run bruno:smoke` script | Independent; required before β produces value in Recipes             |
| (CREW-prereq)                    | Bruno collection for crew daemon                            | After daemon-bootstrap-spec merges; required before β produces value |

**Implementation note — module location:** This plan keeps bruno-smoke logic in `packages/cli/src/lib/bruno-smoke/`, parallel to `packages/cli/src/lib/visual-testing/`. When `crew-shared` gets bootstrapped (architecture Phase 1.5), this module relocates with no API changes.

**DRY note — `resolveAppUrl`:** the bruno-smoke module imports `resolveAppUrl` and `DockerPorts` from `../visual-testing/index.js`. The substitution rules are identical (same docker port placeholders) and there's no value in duplicating the implementation. If a third caller appears later, the spec opens a follow-up to promote the helper to a shared `url-substitution` module.

---

## CREW-bruno-α — Foundation

### Task 1: TOML schema additions

**Files:**

- Modify: `packages/shared/src/config/schema.ts`
- Test: `packages/shared/src/config/loader.test.ts`

- [ ] **Step 1: Write failing tests for the new schema cases**

Append to `packages/shared/src/config/loader.test.ts`:

```ts
describe('parseProjectConfig — bruno_smoke', () => {
  const baseToml = `
name = "minimal"
repo_path = "/x"

[jira]
project_key = "MIN"
site = "https://x.atlassian.net"

[github]
repo = "owner/repo"
`;

  it('parses with no [bruno_smoke] section (backwards compatible)', () => {
    const config = parseProjectConfig(baseToml);
    expect(config.bruno_smoke).toBeUndefined();
  });

  it('parses [bruno_smoke] minimal (no docker, no smoke_user)', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "http://localhost:3000"
`;
    const config = parseProjectConfig(raw);
    expect(config.bruno_smoke?.enabled).toBe(true);
    expect(config.bruno_smoke?.base_url).toBe('http://localhost:3000');
    expect(config.bruno_smoke?.collection_dir).toBe('bruno');
    expect(config.bruno_smoke?.smoke_user).toBeUndefined();
  });

  it('parses [bruno_smoke] with port placeholder + [docker]', () => {
    const raw = `${baseToml}
[docker]
canonical_worktree = "main"

[bruno_smoke]
enabled = true
base_url = "https://localhost:{httpsPort}"
`;
    const config = parseProjectConfig(raw);
    expect(config.bruno_smoke?.base_url).toBe('https://localhost:{httpsPort}');
  });

  it('parses custom collection_dir', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "http://localhost:3000"
collection_dir = "api-tests"
`;
    const config = parseProjectConfig(raw);
    expect(config.bruno_smoke?.collection_dir).toBe('api-tests');
  });

  it('parses full [bruno_smoke.smoke_user] sub-table', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "http://localhost:3000"

[bruno_smoke.smoke_user]
email = "smoke@example.com"
username = "smoke"
password = "hunter2"
`;
    const config = parseProjectConfig(raw);
    expect(config.bruno_smoke?.smoke_user).toEqual({
      email: 'smoke@example.com',
      username: 'smoke',
      password: 'hunter2',
    });
  });

  it('rejects [bruno_smoke] without base_url', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
`;
    expect(() => parseProjectConfig(raw)).toThrow();
  });

  it('rejects {httpsPort} placeholder when no [docker] section', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "https://localhost:{httpsPort}"
`;
    expect(() => parseProjectConfig(raw)).toThrow(/docker/);
  });

  it('rejects [bruno_smoke.smoke_user] missing password', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "http://localhost:3000"

[bruno_smoke.smoke_user]
email = "smoke@example.com"
username = "smoke"
`;
    expect(() => parseProjectConfig(raw)).toThrow(/password/);
  });

  it('rejects [bruno_smoke.smoke_user] missing email', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "http://localhost:3000"

[bruno_smoke.smoke_user]
username = "smoke"
password = "hunter2"
`;
    expect(() => parseProjectConfig(raw)).toThrow(/email/);
  });

  it('rejects empty collection_dir', () => {
    const raw = `${baseToml}
[bruno_smoke]
enabled = true
base_url = "http://localhost:3000"
collection_dir = ""
`;
    expect(() => parseProjectConfig(raw)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-shared -- loader.test --run`
Expected: FAIL — `bruno_smoke` is not in the schema.

- [ ] **Step 3: Extend the schema with the bruno_smoke section + cross-validation refines**

In `packages/shared/src/config/schema.ts`:

1. Add the bruno-smoke schema next to the existing `visualTestingSchema`:

```ts
const brunoSmokeSchema = z.object({
  enabled: z.literal(true),
  base_url: z.string().min(1),
  collection_dir: z.string().min(1).default('bruno'),
  smoke_user: z
    .object({
      email: z.string().min(1),
      username: z.string().min(1),
      password: z.string().min(1),
    })
    .optional(),
});
```

2. Add the field inside `projectConfigSchema`'s root object (right after `visual_testing`):

```ts
visual_testing: visualTestingSchema.optional(),
bruno_smoke: brunoSmokeSchema.optional(),
```

3. Extend the existing `.superRefine(...)` to also validate `bruno_smoke.base_url`'s placeholders against `[docker]`:

```ts
.superRefine((cfg, ctx) => {
  const vt = cfg.visual_testing;
  if (vt) {
    const usesPortPlaceholder = PORT_PLACEHOLDERS.some((p) => vt.app_url.includes(p));
    if (usesPortPlaceholder && !cfg.docker) {
      ctx.addIssue({
        code: 'custom',
        path: ['visual_testing', 'app_url'],
        message: `app_url uses a port placeholder (${PORT_PLACEHOLDERS.join(', ')}) but no [docker] section is configured`,
      });
    }
    if (!vt.start_command && !cfg.docker) {
      ctx.addIssue({
        code: 'custom',
        path: ['visual_testing', 'start_command'],
        message:
          'start_command is required when [docker] is not configured (the agent needs a command to bring the app up)',
      });
    }
  }

  const bs = cfg.bruno_smoke;
  if (bs) {
    const usesPortPlaceholder = PORT_PLACEHOLDERS.some((p) => bs.base_url.includes(p));
    if (usesPortPlaceholder && !cfg.docker) {
      ctx.addIssue({
        code: 'custom',
        path: ['bruno_smoke', 'base_url'],
        message: `base_url uses a port placeholder (${PORT_PLACEHOLDERS.join(', ')}) but no [docker] section is configured`,
      });
    }
  }
});
```

(The existing `superRefine` only handled `visual_testing`. We collapse both into one block — the `vt` and `bs` branches are independent.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-shared -- loader.test --run`
Expected: PASS, all new cases green; existing visual-testing cases still green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/config/schema.ts packages/shared/src/config/loader.test.ts
git commit -m "feat(CREW-bruno-α): TOML schema for [bruno_smoke] opt-in section"
```

---

### Task 2: `resolveBrunoEnvName` helper

**Files:**

- Create: `packages/cli/src/lib/bruno-smoke/index.ts`
- Create: `packages/cli/src/lib/bruno-smoke/resolve-env-name.ts`
- Create: `packages/cli/src/lib/bruno-smoke/resolve-env-name.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/bruno-smoke/resolve-env-name.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveBrunoEnvName } from './resolve-env-name.js';

describe('resolveBrunoEnvName', () => {
  it('lowercases the worktree basename', () => {
    expect(resolveBrunoEnvName('/home/me/Repos/Recipes-App-KAN-99')).toBe('recipes-app-kan-99');
  });

  it('handles the canonical worktree name', () => {
    expect(resolveBrunoEnvName('/home/me/Repos/Recipes-App')).toBe('recipes-app');
  });

  it('strips trailing slashes', () => {
    expect(resolveBrunoEnvName('/home/me/Repos/Recipes-App-KAN-99/')).toBe('recipes-app-kan-99');
  });

  it('handles a single-segment path', () => {
    expect(resolveBrunoEnvName('Recipes')).toBe('recipes');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=crew-cli -- resolve-env-name --run`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `resolveBrunoEnvName`**

Create `packages/cli/src/lib/bruno-smoke/resolve-env-name.ts`:

```ts
import { basename } from 'node:path';

export function resolveBrunoEnvName(worktreePath: string): string {
  return basename(worktreePath.replace(/\/+$/, '')).toLowerCase();
}
```

Create `packages/cli/src/lib/bruno-smoke/index.ts`:

```ts
export { resolveBrunoEnvName } from './resolve-env-name.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- resolve-env-name --run`
Expected: PASS, all 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/bruno-smoke/
git commit -m "feat(CREW-bruno-α): resolveBrunoEnvName — lowercased worktree basename"
```

---

### Task 3: `buildEnvFileContent` — `.bru` env file generator

**Files:**

- Create: `packages/cli/src/lib/bruno-smoke/build-env-file.ts`
- Create: `packages/cli/src/lib/bruno-smoke/build-env-file.test.ts`
- Modify: `packages/cli/src/lib/bruno-smoke/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/bruno-smoke/build-env-file.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildEnvFileContent } from './build-env-file.js';

describe('buildEnvFileContent', () => {
  it('emits a vars block with only baseUrl when smokeUser is omitted', () => {
    const content = buildEnvFileContent({ baseUrl: 'http://localhost:3000' });
    expect(content).toBe('vars {\n' + '  baseUrl: http://localhost:3000\n' + '}\n');
  });

  it('emits a vars block with baseUrl and testUser fields when smokeUser is provided', () => {
    const content = buildEnvFileContent({
      baseUrl: 'https://localhost:18443',
      smokeUser: {
        email: 'smoke@example.com',
        username: 'smoke',
        password: 'hunter2',
      },
    });
    expect(content).toBe(
      'vars {\n' +
        '  baseUrl: https://localhost:18443\n' +
        '  testUser.email: smoke@example.com\n' +
        '  testUser.username: smoke\n' +
        '  testUser.password: hunter2\n' +
        '}\n',
    );
  });

  it('matches the snapshot for the full shape', () => {
    expect(
      buildEnvFileContent({
        baseUrl: 'https://localhost:18443',
        smokeUser: { email: 'a@b.c', username: 'a', password: 'p' },
      }),
    ).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=crew-cli -- build-env-file --run`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `buildEnvFileContent`**

Create `packages/cli/src/lib/bruno-smoke/build-env-file.ts`:

```ts
export interface BrunoSmokeUser {
  email: string;
  username: string;
  password: string;
}

export interface BuildEnvFileOptions {
  baseUrl: string;
  smokeUser?: BrunoSmokeUser;
}

export function buildEnvFileContent(opts: BuildEnvFileOptions): string {
  const lines = [`  baseUrl: ${opts.baseUrl}`];
  if (opts.smokeUser) {
    lines.push(
      `  testUser.email: ${opts.smokeUser.email}`,
      `  testUser.username: ${opts.smokeUser.username}`,
      `  testUser.password: ${opts.smokeUser.password}`,
    );
  }
  return `vars {\n${lines.join('\n')}\n}\n`;
}
```

Update `packages/cli/src/lib/bruno-smoke/index.ts`:

```ts
export { resolveBrunoEnvName } from './resolve-env-name.js';
export {
  buildEnvFileContent,
  type BrunoSmokeUser,
  type BuildEnvFileOptions,
} from './build-env-file.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- build-env-file --run`
Expected: PASS, all 3 cases green; snapshot file created on first run.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/bruno-smoke/
git commit -m "feat(CREW-bruno-α): buildEnvFileContent — Bruno env file generator"
```

---

### Task 4: `writeEnvFile` — write to `<worktree>/<collection_dir>/environments/<envName>.bru`

**Files:**

- Create: `packages/cli/src/lib/bruno-smoke/write-env-file.ts`
- Create: `packages/cli/src/lib/bruno-smoke/write-env-file.test.ts`
- Modify: `packages/cli/src/lib/bruno-smoke/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/bruno-smoke/write-env-file.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeEnvFile } from './write-env-file.js';

function makeWorktree(): string {
  return mkdtempSync(join(tmpdir(), 'crew-bruno-test-'));
}

describe('writeEnvFile', () => {
  it('writes <worktree>/<collection_dir>/environments/<envName>.bru with the env file content', () => {
    const wt = makeWorktree();
    mkdirSync(join(wt, 'bruno'), { recursive: true });
    const result = writeEnvFile(wt, {
      collectionDir: 'bruno',
      envName: 'recipes-app-kan-99',
      baseUrl: 'https://localhost:18443',
    });
    expect(result.envFilePath).toBe(join(wt, 'bruno', 'environments', 'recipes-app-kan-99.bru'));
    expect(existsSync(result.envFilePath)).toBe(true);
    const content = readFileSync(result.envFilePath, 'utf8');
    expect(content).toContain('baseUrl: https://localhost:18443');
  });

  it('includes testUser fields when smokeUser is provided', () => {
    const wt = makeWorktree();
    mkdirSync(join(wt, 'bruno'), { recursive: true });
    writeEnvFile(wt, {
      collectionDir: 'bruno',
      envName: 'recipes-app',
      baseUrl: 'http://localhost:3000',
      smokeUser: { email: 'a@b.c', username: 'a', password: 'p' },
    });
    const content = readFileSync(join(wt, 'bruno', 'environments', 'recipes-app.bru'), 'utf8');
    expect(content).toContain('testUser.email: a@b.c');
    expect(content).toContain('testUser.username: a');
    expect(content).toContain('testUser.password: p');
  });

  it('creates the environments/ directory if it does not exist', () => {
    const wt = makeWorktree();
    mkdirSync(join(wt, 'bruno'), { recursive: true });
    expect(existsSync(join(wt, 'bruno', 'environments'))).toBe(false);
    writeEnvFile(wt, {
      collectionDir: 'bruno',
      envName: 'main',
      baseUrl: 'http://localhost:3000',
    });
    expect(existsSync(join(wt, 'bruno', 'environments'))).toBe(true);
  });

  it('returns { existed: true } when overwriting a pre-existing env file', () => {
    const wt = makeWorktree();
    mkdirSync(join(wt, 'bruno', 'environments'), { recursive: true });
    writeFileSync(join(wt, 'bruno', 'environments', 'main.bru'), 'old\n');
    const result = writeEnvFile(wt, {
      collectionDir: 'bruno',
      envName: 'main',
      baseUrl: 'http://localhost:3000',
    });
    expect(result.existed).toBe(true);
    const content = readFileSync(result.envFilePath, 'utf8');
    expect(content).not.toBe('old\n');
  });

  it('throws when <worktree>/<collection_dir>/ does not exist', () => {
    const wt = makeWorktree();
    expect(() =>
      writeEnvFile(wt, {
        collectionDir: 'bruno',
        envName: 'main',
        baseUrl: 'http://localhost:3000',
      }),
    ).toThrow(/collection.*not found|bruno/i);
  });

  it('honours a custom collection_dir', () => {
    const wt = makeWorktree();
    mkdirSync(join(wt, 'api-tests'), { recursive: true });
    const result = writeEnvFile(wt, {
      collectionDir: 'api-tests',
      envName: 'main',
      baseUrl: 'http://localhost:3000',
    });
    expect(result.envFilePath).toBe(join(wt, 'api-tests', 'environments', 'main.bru'));
    expect(existsSync(result.envFilePath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=crew-cli -- write-env-file --run`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `writeEnvFile`**

Create `packages/cli/src/lib/bruno-smoke/write-env-file.ts`:

```ts
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildEnvFileContent, type BrunoSmokeUser } from './build-env-file.js';

export interface WriteEnvFileOptions {
  collectionDir: string;
  envName: string;
  baseUrl: string;
  smokeUser?: BrunoSmokeUser;
}

export interface WriteEnvFileResult {
  envFilePath: string;
  existed: boolean;
}

export function writeEnvFile(worktreePath: string, opts: WriteEnvFileOptions): WriteEnvFileResult {
  const collectionRoot = join(worktreePath, opts.collectionDir);
  if (!existsSync(collectionRoot) || !statSync(collectionRoot).isDirectory()) {
    throw new Error(
      `writeEnvFile: collection directory not found at ${collectionRoot}. ` +
        `[bruno_smoke] is enabled but the project hasn't shipped a '${opts.collectionDir}/' collection. ` +
        `Add one or remove [bruno_smoke] from the project config.`,
    );
  }

  const envDir = join(collectionRoot, 'environments');
  mkdirSync(envDir, { recursive: true });

  const envFilePath = join(envDir, `${opts.envName}.bru`);
  const existed = existsSync(envFilePath);

  const content = buildEnvFileContent({
    baseUrl: opts.baseUrl,
    smokeUser: opts.smokeUser,
  });
  writeFileSync(envFilePath, content);

  return { envFilePath, existed };
}
```

Update `packages/cli/src/lib/bruno-smoke/index.ts`:

```ts
export { resolveBrunoEnvName } from './resolve-env-name.js';
export {
  buildEnvFileContent,
  type BrunoSmokeUser,
  type BuildEnvFileOptions,
} from './build-env-file.js';
export {
  writeEnvFile,
  type WriteEnvFileOptions,
  type WriteEnvFileResult,
} from './write-env-file.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- write-env-file --run`
Expected: PASS, all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/bruno-smoke/
git commit -m "feat(CREW-bruno-α): writeEnvFile — generate per-worktree Bruno env file"
```

---

### Task 5: `agentNeedsAppRunning` helper + docker-lifecycle refactor

**Files:**

- Create: `packages/cli/src/lib/run/app-lifecycle.ts`
- Create: `packages/cli/src/lib/run/app-lifecycle.test.ts`
- Modify: `packages/cli/src/lib/run/index.ts` (re-export the helper)
- Modify: `packages/cli/src/commands/run.ts:310` (replace the single-flag check)

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/run/app-lifecycle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { agentNeedsAppRunning } from './app-lifecycle.js';
import type { ProjectConfig } from 'crew-shared';

function baseConfig(): ProjectConfig {
  return {
    name: 'test',
    repo_path: '/repo',
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: 'a/b' },
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    },
  } as ProjectConfig;
}

describe('agentNeedsAppRunning', () => {
  it('returns false when neither visual_testing nor bruno_smoke is enabled', () => {
    expect(agentNeedsAppRunning(baseConfig())).toBe(false);
  });

  it('returns true when visual_testing is enabled', () => {
    const cfg = baseConfig();
    cfg.visual_testing = { enabled: true, app_url: 'http://x' };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });

  it('returns true when bruno_smoke is enabled', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'bruno' };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });

  it('returns true when both are enabled', () => {
    const cfg = baseConfig();
    cfg.visual_testing = { enabled: true, app_url: 'http://x' };
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'bruno' };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });
});
```

Append to `packages/cli/src/commands/run.test.ts` (alongside the existing `buildDockerBringupScript` block) — the `stop` branch behaviour itself is already covered, but add coverage that the call site uses `agentNeedsAppRunning`. The cleanest way is a unit test on the predicate (above), and the call-site change is verified by integration. No new run.test.ts cases are required for this task.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- app-lifecycle --run`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `agentNeedsAppRunning`**

Create `packages/cli/src/lib/run/app-lifecycle.ts`:

```ts
import type { ProjectConfig } from 'crew-shared';

/**
 * True if the agent needs the project's app stack running for verification.
 * Composed from the [visual_testing] and [bruno_smoke] opt-ins so the docker
 * bringup script knows whether to keep the stack up after `up --detach`.
 */
export function agentNeedsAppRunning(config: ProjectConfig): boolean {
  return Boolean(config.visual_testing?.enabled) || Boolean(config.bruno_smoke?.enabled);
}
```

Update `packages/cli/src/lib/run/index.ts` (which currently does `export * from './<file>.js'` per existing pattern) to add the new module. Append:

```ts
export * from './app-lifecycle.js';
```

- [ ] **Step 4: Update the call site in `run.ts`**

In `packages/cli/src/commands/run.ts`, find:

```ts
const stopAfterBringup = !config.visual_testing?.enabled;
```

(currently around line 310 inside `startDockerBringup`). Replace with:

```ts
const stopAfterBringup = !agentNeedsAppRunning(config);
```

Add the import at the top of the file (alongside the existing run/index.js imports):

```ts
import {
  // ...existing imports unchanged
  agentNeedsAppRunning,
} from '../lib/run/index.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- app-lifecycle --run`
Expected: PASS, all 4 cases green.

Run: `npm test --workspace=crew-cli -- run.test --run`
Expected: PASS, no regressions in the existing `buildDockerBringupScript` cases.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/run/ packages/cli/src/commands/run.ts
git commit -m "feat(CREW-bruno-α): agentNeedsAppRunning — compose docker-lifecycle gate"
```

---

### Task 6: `runTicket` integration — write env file and export `CREW_BRUNO_ENV`

**Files:**

- Modify: `packages/cli/src/commands/run.ts` (within `runTicket()`, after the visual-testing block, before the agent spawn)

This task has no new unit-test surface beyond Task 4 — the writes are thin calls into already-tested modules. Integration is verified manually as part of α's acceptance criterion.

- [ ] **Step 1: Add the import**

At the top of `packages/cli/src/commands/run.ts`, after the existing visual-testing import, add:

```ts
import {
  resolveBrunoEnvName,
  writeEnvFile as writeBrunoEnvFile,
} from '../lib/bruno-smoke/index.js';
```

(Aliasing `writeEnvFile` to `writeBrunoEnvFile` keeps the call site readable next to the existing `writeDockerEnv` and `writeMcpFile`.)

- [ ] **Step 2: Add the bruno-smoke setup block**

In `runTicket()`, immediately after the existing visual-testing block (the `if (config.visual_testing?.enabled)` block, around line 141-149), insert:

```ts
let brunoEnvName: string | undefined;
let resolvedBrunoBaseUrl: string | undefined;
if (config.bruno_smoke?.enabled) {
  resolvedBrunoBaseUrl = resolveAppUrl(config.bruno_smoke.base_url, dockerPorts).raw;
  brunoEnvName = resolveBrunoEnvName(worktree);
  const writeResult = writeBrunoEnvFile(worktree, {
    collectionDir: config.bruno_smoke.collection_dir,
    envName: brunoEnvName,
    baseUrl: resolvedBrunoBaseUrl,
    smokeUser: config.bruno_smoke.smoke_user,
  });
  console.log(
    pc.dim(
      `→ wrote ${writeResult.envFilePath} (CREW_BRUNO_ENV=${brunoEnvName}, baseUrl=${resolvedBrunoBaseUrl})`,
    ),
  );
  if (writeResult.existed) {
    console.warn(pc.yellow(`  ! ${writeResult.envFilePath} already existed — overwritten`));
  }
}
```

We reuse `resolveAppUrl` from the visual-testing module — both subsystems substitute the same docker port placeholders. `dockerPorts` was already declared in the docker block above. `resolvedBrunoBaseUrl` is consumed by Task 7's `buildTicketPrompt` call to avoid re-running the substitution.

- [ ] **Step 3: Plumb `CREW_BRUNO_ENV` into the agent spawn env**

Find the `claudeProcess = execa('claude', ...)` call (around line 190). Its `env` option currently is:

```ts
env: { ...childEnv, GH_TOKEN: ghToken },
```

Replace with:

```ts
env: {
  ...childEnv,
  GH_TOKEN: ghToken,
  ...(brunoEnvName ? { CREW_BRUNO_ENV: brunoEnvName } : {}),
},
```

The conditional spread avoids defining the variable as `undefined` when bruno_smoke is off.

- [ ] **Step 4: Verify typecheck and tests**

Run: `npm run typecheck --workspace=crew-cli`
Expected: PASS.

Run: `npm test --workspace=crew-cli -- --run`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/run.ts
git commit -m "feat(CREW-bruno-α): write per-worktree Bruno env file + export CREW_BRUNO_ENV"
```

---

### Task 7: Base ticket prompt template plumbing

**Files:**

- Modify: `packages/cli/src/lib/prompts/templates/ticket.md` (insert one placeholder)
- Modify: `packages/cli/src/lib/prompts/ticket.ts` (extend `BuildTicketPromptOptions` with optional `brunoSmoke`)
- Modify: `packages/cli/src/lib/prompts/builders.test.ts` (add baseline regression test)

This task adds the placeholder + routing without yet rendering any bruno-smoke content. The slot is ready for β to fill.

- [ ] **Step 1: Write a baseline regression test**

Append to the existing `describe('buildTicketPrompt', ...)` block in `packages/cli/src/lib/prompts/builders.test.ts`:

```ts
it('renders identically when brunoSmoke is undefined as when omitted', () => {
  const a = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
  });
  const b = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
    brunoSmoke: undefined,
  });
  expect(a).toBe(b);
});
```

The existing baseline snapshot test (`'matches the baseline snapshot when visualTesting is omitted'`) will pick up the placeholder addition automatically — see Step 6 below.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: FAIL — `brunoSmoke` is not a valid property on `BuildTicketPromptOptions` (TypeScript error).

- [ ] **Step 3: Add the placeholder + extend the builder**

In `packages/cli/src/lib/prompts/templates/ticket.md`, find the `{{visualTestingBlock}}` line (between step 7 and step 8). Insert `{{brunoSmokeBlock}}` immediately after it on its own line, so the surrounding looks like:

```markdown
7. **Execute, committing per step.** Use `superpowers:test-driven-development`. Frequent small commits referencing `{{key}}`.
   {{visualTestingBlock}}
   {{brunoSmokeBlock}}
8. **Verify.** Invoke `superpowers:verification-before-completion`. Run lint / format / typecheck / test:run.
```

In `packages/cli/src/lib/prompts/ticket.ts`, extend the file:

```ts
import { startCommandHint } from '../visual-testing/index.js';
import { render } from './render.js';

export interface VisualTestingPromptOptions {
  appUrl: string;
  startCommand?: string;
  authored?: {
    testsDir: string;
    testCommand: string;
  };
}

export interface BrunoSmokePromptOptions {
  baseUrl: string;
  envName: string;
  collectionDir: string;
  hasSmokeUser: boolean;
}

export interface BuildTicketPromptOptions {
  key: string;
  githubRepo: string;
  jiraSite: string;
  visualTesting?: VisualTestingPromptOptions;
  brunoSmoke?: BrunoSmokePromptOptions;
  discoveredSkillsBlock?: string;
}

export function buildTicketPrompt(opts: BuildTicketPromptOptions): string {
  return render('ticket', {
    key: opts.key,
    githubRepo: opts.githubRepo,
    jiraSite: opts.jiraSite,
    visualTestingBlock: buildVisualTestingBlock(opts.visualTesting),
    brunoSmokeBlock: buildBrunoSmokeBlock(opts.brunoSmoke),
    discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',
  });
}

function buildVisualTestingBlock(vt: VisualTestingPromptOptions | undefined): string {
  if (!vt) return '';
  const smoke = render('ticket-visual-smoke', {
    appUrl: vt.appUrl,
    startCommandHint: startCommandHint({
      appUrl: vt.appUrl,
      startCommand: vt.startCommand,
    }),
  });
  if (!vt.authored) return smoke;
  const authored = render('ticket-visual-authored', {
    testsDir: vt.authored.testsDir,
    testCommand: vt.authored.testCommand,
  });
  return smoke + authored;
}

function buildBrunoSmokeBlock(bs: BrunoSmokePromptOptions | undefined): string {
  // β fills the bruno-smoke fragment. For α, the placeholder always renders empty.
  return '';
}
```

(The `bs` parameter is intentionally unused at α; β implements the body.)

- [ ] **Step 4: Update the call site in `runTicket` to pass brunoSmoke**

In `packages/cli/src/commands/run.ts`, find the `buildTicketPrompt({ ... })` call (around line 157). Extend it. `brunoEnvName` and `resolvedBrunoBaseUrl` are the local variables populated in Task 6:

```ts
const prompt = buildTicketPrompt({
  key,
  githubRepo: config.github.repo,
  jiraSite: config.jira.site,
  visualTesting:
    config.visual_testing?.enabled && resolvedAppUrl
      ? {
          appUrl: resolvedAppUrl,
          startCommand: config.visual_testing.start_command,
          authored: config.visual_testing.authored
            ? {
                testsDir: config.visual_testing.authored.tests_dir,
                testCommand: config.visual_testing.authored.test_command,
              }
            : undefined,
        }
      : undefined,
  brunoSmoke:
    config.bruno_smoke?.enabled && brunoEnvName && resolvedBrunoBaseUrl
      ? {
          baseUrl: resolvedBrunoBaseUrl,
          envName: brunoEnvName,
          collectionDir: config.bruno_smoke.collection_dir,
          hasSmokeUser: Boolean(config.bruno_smoke.smoke_user),
        }
      : undefined,
  discoveredSkillsBlock,
});
```

The `&& brunoEnvName && resolvedBrunoBaseUrl` guard collapses to the same boolean as `config.bruno_smoke?.enabled` in practice — they're both populated under the same condition in Task 6's block. The redundancy is for type narrowing.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: PASS, all builder tests green; the baseline snapshot may need to be updated (one extra blank line where `{{brunoSmokeBlock}}` resolves to empty). Inspect the diff before accepting.

Run: `npm run typecheck --workspace=crew-cli`
Expected: PASS.

- [ ] **Step 6: Update + inspect the snapshot diff**

The existing baseline snapshot will fail because the rendered prompt gains one extra blank line where `{{brunoSmokeBlock}}` resolves to empty (sandwiched between the `{{visualTestingBlock}}` line and step 8). This is the only acceptable diff.

Run: `npm test --workspace=crew-cli -- builders --run -u` to update snapshots, then:

Run: `git diff packages/cli/src/lib/prompts/__snapshots__/`
Expected: the only changes are (a) the new bruno-smoke-on snapshots created from scratch (empty before, now populated), and (b) one extra blank line in the existing baseline snapshot between step 7 and step 8. **No other text should change.** If meaningful content moved or disappeared, the placeholder is positioned wrong — fix the template placement before re-running.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/lib/prompts/ packages/cli/src/commands/run.ts
git commit -m "feat(CREW-bruno-α): plumb brunoSmoke through buildTicketPrompt (placeholder, no fragment yet)"
```

---

### Task 8: Base fix-pr prompt template plumbing

**Files:**

- Modify: `packages/cli/src/lib/prompts/templates/fix-pr.md` (insert one placeholder)
- Modify: `packages/cli/src/lib/prompts/fix-pr.ts` (extend `BuildFixPrPromptOptions` with optional `brunoSmoke`)

This is the fix-pr equivalent of Task 7. Same placeholder-only shape; γ fills the body.

- [ ] **Step 1: Write a baseline regression test**

Append to the existing `describe('buildFixPrPrompt', ...)` block in `packages/cli/src/lib/prompts/builders.test.ts`:

```ts
it('renders identically when brunoSmoke is undefined as when omitted', () => {
  const a = buildFixPrPrompt({
    key: 'KAN-23',
    feedback: 'fix the typo',
    feedbackSource: 'stdin',
  });
  const b = buildFixPrPrompt({
    key: 'KAN-23',
    feedback: 'fix the typo',
    feedbackSource: 'stdin',
    brunoSmoke: undefined,
  });
  expect(a).toBe(b);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: FAIL — `brunoSmoke` is not a valid property on `BuildFixPrPromptOptions`.

- [ ] **Step 3: Add the placeholder + extend the builder**

In `packages/cli/src/lib/prompts/templates/fix-pr.md`, find the curated Skills bullet list (the one ending with `superpowers:requesting-code-review`). After the line:

```markdown
- **`superpowers:requesting-code-review`** — before pushing.{{discoveredSkillsBlock}}
```

Insert a new line `{{brunoSmokeBlock}}` (on its own line, with a blank line above and below):

```markdown
- **`superpowers:requesting-code-review`** — before pushing.{{discoveredSkillsBlock}}

{{brunoSmokeBlock}}

## Apply the fixes
```

In `packages/cli/src/lib/prompts/fix-pr.ts`, extend the file:

```ts
import { render } from './render.js';

export interface BrunoSmokePromptOptions {
  baseUrl: string;
  envName: string;
  collectionDir: string;
  hasSmokeUser: boolean;
}

export interface BuildFixPrPromptOptions {
  key: string;
  feedback: string;
  feedbackSource: string;
  conflictFiles?: string[];
  brunoSmoke?: BrunoSmokePromptOptions;
  discoveredSkillsBlock?: string;
}

export function buildFixPrPrompt(opts: BuildFixPrPromptOptions): string {
  const conflictFiles = opts.conflictFiles ?? [];
  const hasConflicts = conflictFiles.length > 0;
  const conflictPreamble = hasConflicts
    ? render('conflict-preamble', {
        key: opts.key,
        fileList: conflictFiles.map((f) => `- ${f}`).join('\n'),
      })
    : '';
  const pushDirective = hasConflicts
    ? `**DO NOT PUSH this run.** Conflicts were resolved during the rebase, so the human must inspect the resolution commits before they reach origin. After your feedback fixes are committed and verified, print exactly one line and exit: "Rebase resolution + feedback ready for inspection — run 'git push --force-with-lease origin ${opts.key}' once you've reviewed."`
    : `Push with \`git push --force-with-lease origin ${opts.key}\` to extend the existing PR. Do NOT open a new PR. Plain \`--force\` is never allowed.`;
  return render('fix-pr', {
    key: opts.key,
    feedback: opts.feedback,
    feedbackSource: opts.feedbackSource,
    conflictPreamble,
    pushDirective,
    brunoSmokeBlock: buildBrunoSmokeBlock(opts.brunoSmoke),
    discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',
  });
}

function buildBrunoSmokeBlock(bs: BrunoSmokePromptOptions | undefined): string {
  // γ fills the fix-pr-bruno-smoke fragment. For α, always empty.
  return '';
}
```

To keep `BrunoSmokePromptOptions` defined in one place, **import** it from `./ticket.js` instead of redeclaring:

```ts
import { render } from './render.js';
import type { BrunoSmokePromptOptions } from './ticket.js';

export interface BuildFixPrPromptOptions {
  key: string;
  feedback: string;
  feedbackSource: string;
  conflictFiles?: string[];
  brunoSmoke?: BrunoSmokePromptOptions;
  discoveredSkillsBlock?: string;
}
// ... (rest unchanged)
```

Re-export `BrunoSmokePromptOptions` from `packages/cli/src/lib/prompts/index.ts` so callers can import it from a single barrel:

```ts
export {
  buildTicketPrompt,
  type BuildTicketPromptOptions,
  type BrunoSmokePromptOptions,
} from './ticket.js';
export { buildFixPrPrompt, type BuildFixPrPromptOptions } from './fix-pr.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: PASS.

Run: `npm run typecheck --workspace=crew-cli`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/prompts/
git commit -m "feat(CREW-bruno-α): plumb brunoSmoke through buildFixPrPrompt (placeholder, no fragment yet)"
```

---

### Task 9: README — bruno-smoke setup foundational subsection

**Files:**

- Modify: `README.md` (add a new subsection under `## Setup`, between Visual testing and GitHub token)

- [ ] **Step 1: Add the subsection**

In `README.md`, find the `### GitHub token (once per project)` heading (currently around line 108). Insert _before_ it (so the new subsection sits right after `### Visual testing (per project, optional)`):

````markdown
### Bruno smoke tests (per project, optional)

Crew can run a [Bruno](https://www.usebruno.com/) HTTP smoke check as part of the dispatched agent's verification step, and ensures the agent keeps `.bru` files in sync when endpoints change. Off by default. Opt in by adding a `[bruno_smoke]` section to the project's TOML at `~/.config/crew/projects/<name>.toml`:

```toml
[bruno_smoke]
enabled = true
base_url = "https://localhost:{httpsPort}"   # placeholders {httpPort}, {httpsPort}, {postgresPort} are substituted from the docker .env when [docker] is present
collection_dir = "bruno"                     # optional; defaults to "bruno"

# Optional. Supplies test-user creds for the smoke run's login flow. Omit when
# the API has no auth or the runner injects its own credentials.
[bruno_smoke.smoke_user]
email    = "smoke@example.com"
username = "smoke"
password = "hunter2"
```

When enabled, `crew run` (and `crew fix-pr`):

- Generates `<worktree>/<collection_dir>/environments/<envName>.bru` containing a `vars { baseUrl, testUser.* }` block. `<envName>` is the lowercased worktree basename (e.g. `recipes-app-kan-99` for the KAN-99 worktree).
- Exports `CREW_BRUNO_ENV=<envName>` in the agent's spawn env. The project's `npm run bruno:smoke` script reads it (e.g. `bru run --env "$CREW_BRUNO_ENV" flows/login.bru flows/main-smoke.bru`).
- Leaves the docker stack **running** (composed with `[visual_testing]`'s lifecycle gate) so the agent has a live API to hit.

When disabled (no `[bruno_smoke]` section), behaviour is unchanged.

**Bootstrap a new project's Bruno collection.** Crew does **not** ship the Bruno collection — the project owns it. Per-project bootstrap (one-time, by hand):

1. Create `<repo>/<collection_dir>/` (default `<repo>/bruno/`) and run `bru init` (or copy a sibling project's collection).
2. Add `<repo>/<collection_dir>/.gitignore` containing `environments/` so generated env files never get committed.
3. Author at least `flows/login.bru` (uses `vars.testUser.*` to authenticate and stashes the token via `vars:post-response { token: res.body.token }`) and `flows/main-smoke.bru` (the project's golden-path API call sequence).
4. Add an npm script:
   ```json
   "scripts": {
     "bruno:smoke": "bru run --env \"$CREW_BRUNO_ENV\" flows/login.bru flows/main-smoke.bru"
   }
   ```
5. Install the Bruno CLI as a dev dep: `npm install --save-dev @usebruno/cli`.

Once these are in place, `crew run` against a backend ticket will do the rest.

**The `bruno-collection-maintenance` skill.** The agent automatically picks up the user-scope `bruno-collection-maintenance` skill at `~/.claude/skills/bruno-collection-maintenance/`. The skill teaches the file-naming conventions, the `vars:post-response` chaining pattern, and the "update `.bru` when touching endpoints" rule.
````

- [ ] **Step 2: Verify the formatting**

Run: `npm run format:check`
Expected: PASS.

If Prettier complains, run `npm run format` and re-stage.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(CREW-bruno-α): README — bruno-smoke per-project setup"
```

---

## CREW-bruno-β — Ticket smoke prompt fragment

### Task 10: Smoke fragment template + `buildTicketPrompt` branch

**Files:**

- Create: `packages/cli/src/lib/prompts/templates/ticket-bruno-smoke.md`
- Modify: `packages/cli/src/lib/prompts/ticket.ts` (replace the empty `buildBrunoSmokeBlock`)
- Modify: `packages/cli/src/lib/prompts/builders.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the `buildTicketPrompt` describe block in `packages/cli/src/lib/prompts/builders.test.ts`:

```ts
it('renders the bruno-smoke section when brunoSmoke is provided (no smoke_user)', () => {
  const prompt = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
    brunoSmoke: {
      baseUrl: 'https://localhost:18443',
      envName: 'recipes-kan-23',
      collectionDir: 'bruno',
      hasSmokeUser: false,
    },
  });
  expect(prompt).toContain('API smoke verification (Bruno)');
  expect(prompt).toContain('https://localhost:18443');
  expect(prompt).toContain('CREW_BRUNO_ENV=recipes-kan-23');
  expect(prompt).toContain('npm run bruno:smoke');
  expect(prompt).toContain('bruno/');
  expect(prompt).not.toContain('and a test user');
  expect(prompt).toMatchSnapshot();
});

it('renders the testUser clause when hasSmokeUser is true', () => {
  const prompt = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
    brunoSmoke: {
      baseUrl: 'https://localhost:18443',
      envName: 'recipes-kan-23',
      collectionDir: 'bruno',
      hasSmokeUser: true,
    },
  });
  expect(prompt).toContain('and a test user');
  expect(prompt).toMatchSnapshot();
});

it('renders both visual-testing and bruno-smoke when both are provided', () => {
  const prompt = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
    visualTesting: { appUrl: 'https://localhost:18443' },
    brunoSmoke: {
      baseUrl: 'https://localhost:18443',
      envName: 'recipes-kan-23',
      collectionDir: 'bruno',
      hasSmokeUser: true,
    },
  });
  expect(prompt).toContain('Visual smoke verification');
  expect(prompt).toContain('API smoke verification (Bruno)');
  const visualIdx = prompt.indexOf('Visual smoke verification');
  const brunoIdx = prompt.indexOf('API smoke verification (Bruno)');
  expect(brunoIdx).toBeGreaterThan(visualIdx);
  expect(prompt).toMatchSnapshot();
});

it('honours a custom collection_dir in the rendered fragment', () => {
  const prompt = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
    brunoSmoke: {
      baseUrl: 'http://localhost:3000',
      envName: 'recipes',
      collectionDir: 'api-tests',
      hasSmokeUser: false,
    },
  });
  expect(prompt).toContain('api-tests/');
  expect(prompt).not.toContain('`bruno/`');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: FAIL — bruno-smoke block still renders empty.

- [ ] **Step 3: Create the smoke fragment template**

Create `packages/cli/src/lib/prompts/templates/ticket-bruno-smoke.md`:

```markdown
## API smoke verification (Bruno)

This project has a Bruno collection at `{{collectionDir}}/`. The worktree's API runs at **{{baseUrl}}**, and crew has generated `{{collectionDir}}/environments/{{envName}}.bru` with `baseUrl`{{testUserClause}} for you. The environment is exported as `CREW_BRUNO_ENV={{envName}}` in your spawn env.

Two non-negotiable rules whenever this project's API is involved:

1. **Run the smoke flow as part of verification.** Before claiming "Verify" complete, run `npm run bruno:smoke` (the project's script reads `CREW_BRUNO_ENV` automatically). A non-zero exit means smoke failed — verification is **not** complete; loop back to step 7 (Execute).
2. **Update `.bru` files when endpoints change.** If you add, remove, or modify any HTTP endpoint, the same PR must add or update the matching `{{collectionDir}}/endpoints/<route-group>/<verb>-<name>[-<case>].bru` and `{{collectionDir}}/flows/<flow>.bru` files. Coverage drifts the moment a route changes without its `.bru`.

The `bruno-collection-maintenance` skill (auto-discovered) covers naming conventions, the `vars:post-response` patterns, and the conventions for `flows/` vs `endpoints/`.
```

(Note: leading and trailing blank lines kept so the block sits cleanly between the visual-testing block and step 8.)

- [ ] **Step 4: Update `buildBrunoSmokeBlock` to render the fragment**

In `packages/cli/src/lib/prompts/ticket.ts`, replace the existing `buildBrunoSmokeBlock` function with:

```ts
function buildBrunoSmokeBlock(bs: BrunoSmokePromptOptions | undefined): string {
  if (!bs) return '';
  return render('ticket-bruno-smoke', {
    baseUrl: bs.baseUrl,
    envName: bs.envName,
    collectionDir: bs.collectionDir,
    testUserClause: bs.hasSmokeUser ? ' and a test user' : '',
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: PASS for all four new cases (snapshots created on first run); the VT-off / bruno-off baseline must still match the prior snapshot.

If a baseline snapshot diverges meaningfully (i.e. for a case that should have been unaffected), inspect the diff before accepting — it likely means the placeholder is misplaced.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/prompts/
git commit -m "feat(CREW-bruno-β): bruno-smoke prompt fragment for crew run"
```

---

### Task 11: Sanity-check the rendered prompt visually

**Files:** none — manual inspection step.

- [ ] **Step 1: Print the rendered prompt for each case**

Run a one-off script via tsx:

```bash
cd /home/safturento/Repos/crew
npx tsx -e "
import { buildTicketPrompt } from './packages/cli/src/lib/prompts/index.js';
console.log('=== bruno off ===');
console.log(buildTicketPrompt({ key: 'KAN-23', githubRepo: 'Safturento/Recipes', jiraSite: 'https://safturento.atlassian.net' }));
console.log('=== bruno on (no smoke_user) ===');
console.log(buildTicketPrompt({ key: 'KAN-23', githubRepo: 'Safturento/Recipes', jiraSite: 'https://safturento.atlassian.net', brunoSmoke: { baseUrl: 'https://localhost:18443', envName: 'recipes-kan-23', collectionDir: 'bruno', hasSmokeUser: false } }));
console.log('=== bruno on (with smoke_user) + visual_testing on ===');
console.log(buildTicketPrompt({ key: 'KAN-23', githubRepo: 'Safturento/Recipes', jiraSite: 'https://safturento.atlassian.net', visualTesting: { appUrl: 'https://localhost:18443' }, brunoSmoke: { baseUrl: 'https://localhost:18443', envName: 'recipes-kan-23', collectionDir: 'bruno', hasSmokeUser: true } }));
"
```

Expected: bruno-off output is identical to today's prompt. Bruno-on output has the bruno block between the visual-testing block (or step 7 if VT off) and step 8, with the right URL, env name, and the `testUser` clause appearing only when `hasSmokeUser: true`.

- [ ] **Step 2: No commit (this is a manual verification step)**

---

### Task 12: README — bruno-smoke at agent runtime

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Append to the bruno-smoke subsection**

Find the closing of the `### Bruno smoke tests (per project, optional)` subsection (the **The `bruno-collection-maintenance` skill.** paragraph). Insert a new paragraph immediately before it:

```markdown
**At agent runtime.** When `[bruno_smoke]` is enabled, the dispatched agent's prompt requires `npm run bruno:smoke` as part of the Verify step. A non-zero exit blocks "Verify" the same way a failing unit test does. The agent is also instructed to update the matching `<collection_dir>/endpoints/<route-group>/<verb>-<name>.bru` (and `<collection_dir>/flows/<flow>.bru` where relevant) in the same PR whenever it adds or modifies an HTTP route — keeping smoke coverage from drifting silently.
```

- [ ] **Step 2: Format check**

Run: `npm run format:check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(CREW-bruno-β): README — bruno-smoke at agent runtime"
```

---

## CREW-bruno-γ — fix-pr smoke prompt fragment

### Task 13: Fix-pr fragment template + `buildFixPrPrompt` branch

**Files:**

- Create: `packages/cli/src/lib/prompts/templates/fix-pr-bruno-smoke.md`
- Modify: `packages/cli/src/lib/prompts/fix-pr.ts` (replace the empty `buildBrunoSmokeBlock`)
- Modify: `packages/cli/src/lib/prompts/builders.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the `describe('buildFixPrPrompt', ...)` block in `packages/cli/src/lib/prompts/builders.test.ts`:

```ts
it('renders the bruno-smoke section when brunoSmoke is provided', () => {
  const prompt = buildFixPrPrompt({
    key: 'KAN-23',
    feedback: 'rename the field from x to y',
    feedbackSource: 'GitHub PR comments',
    brunoSmoke: {
      baseUrl: 'https://localhost:18443',
      envName: 'recipes-kan-23',
      collectionDir: 'bruno',
      hasSmokeUser: true,
    },
  });
  expect(prompt).toContain('API smoke verification (Bruno)');
  expect(prompt).toContain('https://localhost:18443');
  expect(prompt).toContain('CREW_BRUNO_ENV=recipes-kan-23');
  expect(prompt).toContain('npm run bruno:smoke');
  expect(prompt).toMatchSnapshot();
});

it('renders the bruno-smoke block before the Apply the fixes section', () => {
  const prompt = buildFixPrPrompt({
    key: 'KAN-23',
    feedback: 'fix the typo',
    feedbackSource: 'stdin',
    brunoSmoke: {
      baseUrl: 'http://localhost:3000',
      envName: 'recipes',
      collectionDir: 'bruno',
      hasSmokeUser: false,
    },
  });
  const brunoIdx = prompt.indexOf('API smoke verification (Bruno)');
  const fixesIdx = prompt.indexOf('Apply the fixes');
  expect(brunoIdx).toBeGreaterThan(-1);
  expect(fixesIdx).toBeGreaterThan(brunoIdx);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: FAIL — fix-pr bruno-smoke block still renders empty.

- [ ] **Step 3: Create the fix-pr fragment template**

Create `packages/cli/src/lib/prompts/templates/fix-pr-bruno-smoke.md`:

```markdown
## API smoke verification (Bruno)

This project has a Bruno collection at `{{collectionDir}}/`. Crew already generated `{{collectionDir}}/environments/{{envName}}.bru` (pointing at **{{baseUrl}}**) for the original run. `CREW_BRUNO_ENV={{envName}}` is set in your env.

While applying feedback:

- If your fix touches any HTTP endpoint behaviour, update the matching `{{collectionDir}}/endpoints/...` and (where relevant) `{{collectionDir}}/flows/...` files in the same set of commits.
- Before pushing, run `npm run bruno:smoke`. Smoke must pass. A connection error usually means the worktree's stack isn't up — bring it up the same way the original `crew run` did, then re-run smoke.

Treat smoke failure the same as test failure: do not push.
```

- [ ] **Step 4: Update `buildBrunoSmokeBlock` in `fix-pr.ts`**

In `packages/cli/src/lib/prompts/fix-pr.ts`, replace the empty placeholder with:

```ts
function buildBrunoSmokeBlock(bs: BrunoSmokePromptOptions | undefined): string {
  if (!bs) return '';
  return render('fix-pr-bruno-smoke', {
    baseUrl: bs.baseUrl,
    envName: bs.envName,
    collectionDir: bs.collectionDir,
  });
}
```

(`hasSmokeUser` is unused in the fix-pr fragment — by this point the env file already exists and the agent doesn't need to be told the user clause again.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: PASS, all new cases green; existing fix-pr cases still green.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/prompts/
git commit -m "feat(CREW-bruno-γ): bruno-smoke prompt fragment for crew fix-pr"
```

---

### Task 14: `crew fix-pr` plumbs project config + brunoSmoke through

**Files:**

- Modify: `packages/cli/src/commands/fix-pr.ts`
- Modify: `packages/cli/src/commands/fix-pr.test.ts`

- [ ] **Step 1: Inspect the existing fix-pr.test.ts shape**

Run: `grep -n "describe\|it(" packages/cli/src/commands/fix-pr.test.ts | head`

Expected: a list of existing test blocks. We append to the existing structure rather than fight it. If `runFixPr` is exported and unit-testable, prefer that. If not, the test surface is `loadFeedback` + `selectMode` + `parseGithubPrUrl` — the brunoSmoke plumbing then needs an integration-style test that mocks `discoverProjectConfig` and `spawnClaudeResume` to assert `buildFixPrPrompt` receives the right `brunoSmoke` value. Pick the option matching the file's existing pattern.

- [ ] **Step 2: Write a failing test for the brunoSmoke plumbing**

The cleanest unit-testable surface is to extract a small pure helper from `runFixPr` that maps a `ProjectConfig + worktree` to `BrunoSmokePromptOptions | undefined`. Create that helper inline.

Append to `packages/cli/src/commands/fix-pr.test.ts`:

```ts
import { brunoSmokeOptionsFor } from './fix-pr.js';
import type { ProjectConfig } from 'crew-shared';

function baseConfig(): ProjectConfig {
  return {
    name: 'test',
    repo_path: '/repo',
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: 'a/b' },
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    },
  } as ProjectConfig;
}

describe('brunoSmokeOptionsFor', () => {
  it('returns undefined when bruno_smoke is not enabled', () => {
    expect(brunoSmokeOptionsFor(baseConfig(), '/wt/main')).toBeUndefined();
  });

  it('throws when bruno_smoke uses a port placeholder without [docker]', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'https://localhost:{httpsPort}',
      collection_dir: 'bruno',
    };
    expect(() => brunoSmokeOptionsFor(cfg, '/wt/main')).toThrow(/port|docker/i);
  });

  it('returns the resolved options when bruno_smoke is enabled', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'http://localhost:3000',
      collection_dir: 'bruno',
    };
    const opts = brunoSmokeOptionsFor(cfg, '/wt/Recipes-App-KAN-99');
    expect(opts).toEqual({
      baseUrl: 'http://localhost:3000',
      envName: 'recipes-app-kan-99',
      collectionDir: 'bruno',
      hasSmokeUser: false,
    });
  });

  it('reports hasSmokeUser true when smoke_user is configured', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'http://localhost:3000',
      collection_dir: 'bruno',
      smoke_user: { email: 'a', username: 'b', password: 'c' },
    };
    const opts = brunoSmokeOptionsFor(cfg, '/wt/main');
    expect(opts?.hasSmokeUser).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- fix-pr.test --run`
Expected: FAIL — `brunoSmokeOptionsFor` is not exported.

- [ ] **Step 4: Implement `brunoSmokeOptionsFor` and plumb config through `runFixPr`**

In `packages/cli/src/commands/fix-pr.ts`:

1. Add imports at the top:

```ts
import { discoverProjectConfig } from '../lib/index.js';
import { resolveAppUrl } from '../lib/visual-testing/index.js';
import { resolveBrunoEnvName } from '../lib/bruno-smoke/index.js';
import type { BrunoSmokePromptOptions } from '../lib/prompts/index.js';
import type { ProjectConfig } from 'crew-shared';
```

2. Add the helper near the top of the file (above `runFixPr`):

```ts
export function brunoSmokeOptionsFor(
  config: ProjectConfig,
  worktree: string,
): BrunoSmokePromptOptions | undefined {
  const bs = config.bruno_smoke;
  if (!bs?.enabled) return undefined;

  const dockerPorts = config.docker
    ? {
        // fix-pr does not run writeDockerEnv; the .env on disk is authoritative.
        // Read it from the worktree's existing .env file rather than recomputing.
        // For now, parse minimally — the same port keys writeDockerEnv writes.
        ...readDockerPortsFromEnvFile(worktree),
      }
    : undefined;

  const baseUrl = resolveAppUrl(bs.base_url, dockerPorts).raw;
  return {
    baseUrl,
    envName: resolveBrunoEnvName(worktree),
    collectionDir: bs.collection_dir,
    hasSmokeUser: Boolean(bs.smoke_user),
  };
}
```

The `readDockerPortsFromEnvFile` helper reads the existing `<worktree>/.env` file (written during the original `crew run`) and parses out the port values. Add it to the same file:

```ts
import { readFileSync } from 'node:fs';

function readDockerPortsFromEnvFile(worktree: string): {
  httpPort: number;
  httpsPort: number;
  postgresPort: number;
} {
  const envPath = join(worktree, '.env');
  if (!existsSync(envPath)) {
    throw new Error(
      `fix-pr cannot resolve Bruno base_url placeholders: ${envPath} not found. ` +
        `Run 'crew run ${'<KEY>'}' first or remove port placeholders from base_url.`,
    );
  }
  const raw = readFileSync(envPath, 'utf8');
  const get = (key: string): number => {
    const match = raw.match(new RegExp(`^${key}=(\\d+)$`, 'm'));
    if (!match) throw new Error(`fix-pr: ${key} not found in ${envPath}`);
    return Number(match[1]);
  };
  return {
    httpPort: get('CADDY_HTTP_PORT'),
    httpsPort: get('CADDY_HTTPS_PORT'),
    postgresPort: get('POSTGRES_PORT'),
  };
}
```

(Add `import { join } from 'node:path';` if not already imported.)

3. In `runFixPr`, after the `worktree` variable is computed and the `repoPathFromWorktree(worktree, key)` is available, load the project config:

```ts
const repoPath = repoPathFromWorktree(worktree, key);
const projectConfig = await discoverProjectConfig(repoPath);
const brunoSmoke = projectConfig ? brunoSmokeOptionsFor(projectConfig, worktree) : undefined;
```

4. Pass `brunoSmoke` into the `buildFixPrPrompt` call:

```ts
const prompt = buildFixPrPrompt({
  key,
  feedback,
  feedbackSource: source,
  conflictFiles: conflicts,
  brunoSmoke,
  discoveredSkillsBlock: renderDiscoveredSkillsBlock(
    discoverSkills({ repoPath: repoPathFromWorktree(worktree, key) }),
  ),
});
```

(The `discoverSkills` call already uses `repoPathFromWorktree`. Reuse `repoPath` from the new variable to DRY.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- fix-pr.test --run`
Expected: PASS, all 4 helper cases green; existing fix-pr cases still green.

Run: `npm run typecheck --workspace=crew-cli`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/fix-pr.ts packages/cli/src/commands/fix-pr.test.ts
git commit -m "feat(CREW-bruno-γ): crew fix-pr plumbs bruno_smoke through to the prompt"
```

---

### Task 15: Sanity-check the rendered fix-pr prompt

**Files:** none — manual inspection step.

- [ ] **Step 1: Print the rendered fix-pr prompt for each case**

```bash
cd /home/safturento/Repos/crew
npx tsx -e "
import { buildFixPrPrompt } from './packages/cli/src/lib/prompts/index.js';
console.log('=== bruno off ===');
console.log(buildFixPrPrompt({ key: 'KAN-23', feedback: 'rename x to y', feedbackSource: 'PR comments' }));
console.log('=== bruno on ===');
console.log(buildFixPrPrompt({ key: 'KAN-23', feedback: 'rename x to y', feedbackSource: 'PR comments', brunoSmoke: { baseUrl: 'https://localhost:18443', envName: 'recipes-kan-23', collectionDir: 'bruno', hasSmokeUser: true } }));
"
```

Expected: bruno-off output is identical to today's fix-pr prompt. Bruno-on output has the API smoke verification block sitting between the Skills list and the "Apply the fixes" section.

- [ ] **Step 2: No commit**

---

### Task 16: README — bruno-smoke in fix-pr

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Append to the bruno-smoke subsection**

In the `### Bruno smoke tests (per project, optional)` subsection, after the **At agent runtime.** paragraph (added in Task 12), append:

```markdown
**During `crew fix-pr`.** The same rules apply: the agent must run `npm run bruno:smoke` before pushing, and must update `.bru` files in the same set of fix-up commits if the fix touches an HTTP endpoint. `crew fix-pr` does not bring docker up itself — if smoke fails with a connection error, the worktree's stack isn't running.
```

- [ ] **Step 2: Format check**

Run: `npm run format:check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(CREW-bruno-γ): README — bruno-smoke in fix-pr"
```

---

## CREW-bruno-skill — Off-repo SKILL.md

> **Note:** this ticket has no commits in the crew repo. The deliverable is a file in the user's home directory (`~/.claude/skills/bruno-collection-maintenance/SKILL.md`). It's tracked as a Jira ticket so the dependency is visible, but its acceptance is "the file exists and `discoverSkills()` lists it" — verified out-of-band.

### Task 17: Author `~/.claude/skills/bruno-collection-maintenance/SKILL.md`

**Files:**

- Create: `~/.claude/skills/bruno-collection-maintenance/SKILL.md`

- [ ] **Step 1: Create the skill directory and file**

```bash
mkdir -p ~/.claude/skills/bruno-collection-maintenance
```

- [ ] **Step 2: Write the skill file**

Create `~/.claude/skills/bruno-collection-maintenance/SKILL.md` with this content:

```markdown
---
name: bruno-collection-maintenance
description: Use when authoring or modifying HTTP routes (Fastify route registration, controller files, OpenAPI schemas, or anything that adds/changes a request/response shape) in a project with a `bruno/` directory. Even if the change is small, even if a quick `npm run bruno:smoke` looks green, the matching `bruno/endpoints/<group>/<verb>-<name>.bru` must be added or updated in the same commit. Skip only when the change is in a project without `bruno/` at all.
---

# Bruno collection maintenance

This skill applies whenever you author or modify HTTP routes in a project that has a `bruno/` directory. Crew's per-project setup writes a generated `bruno/environments/<envName>.bru` and exports `CREW_BRUNO_ENV=<envName>`, so the project's `npm run bruno:smoke` script can be invoked directly. Your job is to keep the collection in sync with the code.

## File layout
```

bruno/
├── bruno.json # collection metadata
├── .gitignore # excludes environments/
├── environments/<envName>.bru # generated per-worktree by crew — never commit
├── endpoints/
│ └── <route-group>/
│ ├── post-create.bru
│ ├── get-show.bru
│ ├── get-list.bru
│ └── delete-destroy.bru
└── flows/
├── login.bru # the auth flow other flows depend on
└── main-smoke.bru # the canonical end-to-end smoke

```

- **`endpoints/`** — one `.bru` per (route, verb) pair. Filename `<verb>-<name>[-<case>].bru` (e.g. `post-create-with-tags.bru` for a variant). Mirror the project's route grouping (`endpoints/recipes/`, `endpoints/auth/`).
- **`flows/`** — multi-step user journeys. Each flow chains endpoint requests with `vars:post-response` to thread state.

## When you change a route, you change a `.bru`

- **New endpoint** → add a new `.bru` under `endpoints/<group>/`. Pick the closest existing sibling and copy its shape (auth header, body shape, asserts).
- **Renamed endpoint** → rename the `.bru` to match (`mv` it, don't leave the old name dangling).
- **Changed request body** → update the `body { ... }` block.
- **Changed response shape** → update the `assert { ... }` block. Asserts that exercise the new field count as test coverage; vague asserts (e.g. `assert: res.status: 200`) are not.
- **Removed endpoint** → delete the `.bru` and remove any flow steps that called it.

`npm run bruno:smoke` passing is **necessary** but not **sufficient**. Smoke flows hit a small subset of endpoints; coverage drift in less-trafficked endpoints is what this skill prevents.

## Auth chaining pattern

The project's `flows/login.bru` runs first and saves a token via `vars:post-response`:

```

vars:post-response {
token: res.body.token
}

```

Subsequent flow steps read it from the env (it's set on the env for the duration of the run, scoped to the flow):

```

auth {
bearer: {
token: {{token}}
}
}

```

When you add an authenticated endpoint, copy this shape — do not hand-roll a token by pasting one in.

## What does NOT trigger this skill

- Pure refactors that don't change the request/response shape (renaming an internal helper, splitting a controller into two files where the route signature is identical).
- Backend changes outside the HTTP layer (worker jobs, scheduled tasks, internal services).
- Documentation, comments, formatting.

If you're unsure, the safe default is to update the `.bru` — false positives (a touched-but-unchanged `.bru`) cost a tiny diff; false negatives (an out-of-date `.bru`) hide regressions.
```

- [ ] **Step 3: Verify discoverability**

```bash
cd /home/safturento/Repos/crew
npx tsx -e "
import { discoverSkills } from './packages/cli/src/lib/prompts/skills.js';
const skills = discoverSkills({ repoPath: '$HOME/Repos/crew' });
console.log(skills.find(s => s.name === 'bruno-collection-maintenance'));
"
```

Expected: prints an object with `name`, `description`, and `source: 'user'`. Description text matches the frontmatter.

- [ ] **Step 4: No commit in this repo**

The skill file lives in `~/.claude/skills/`, not the crew repo. Commit it to your dotfiles repo (or whatever mechanism you use to version `~/.claude/`) per your usual workflow.

---

## After all tasks land

The Epic is complete when CREW-bruno-α/β/γ are all merged to `main` and the `bruno-collection-maintenance` skill is in place at `~/.claude/skills/`. The two target-repo prerequisite tickets (Recipes Bruno collection + crew daemon Bruno collection) are independent and may merge before, during, or after the crew epic — they only gate β/γ's _value_ per repo, not β/γ's merge.

**Manual end-to-end verification** (not enforced by CI, but the acceptance gate per ticket):

- **CREW-bruno-α:** in a throwaway worktree of a project with `[bruno_smoke]` enabled and a `bruno/` directory, run `crew run KAN-XX` against a no-op ticket. Confirm `bruno/environments/<envName>.bru` exists with the right `baseUrl` and `testUser.*` lines (or just `baseUrl` if no `smoke_user` configured), `CREW_BRUNO_ENV=<envName>` is in the spawned process env, and the docker stack stays up after bringup.
- **CREW-bruno-β:** run `crew run KAN-XX` for a backend ticket. Watch the agent's transcript. Confirm the agent calls `npm run bruno:smoke` before claiming Verify done. If it modifies an endpoint, confirm the matching `.bru` lands in the PR.
- **CREW-bruno-γ:** push a PR that touches an endpoint, leave a feedback comment asking for a tweak, run `crew fix-pr KAN-XX`. Watch the agent run `npm run bruno:smoke` again before pushing the fix and update the matching `.bru`.
- **CREW-bruno-skill:** confirm the discoverability check in Task 17 Step 3 returns the skill, and run a dispatched agent on a ticket that touches a route — the prompt should include the skill bullet under the discoveredSkillsBlock.

## Self-review checklist for the implementing engineer

Before opening the PR for any ticket:

- [ ] All commit messages are prefixed with the ticket key (`CREW-bruno-α/β/γ`).
- [ ] No commits on `main` — work happens on the branch named after the ticket key.
- [ ] `npm run lint && npm run format:check && npm run typecheck && npm run test:run` all pass at the repo root.
- [ ] No new Prettier or ESLint warnings.
- [ ] If you added a snapshot, you inspected the snapshot file content and confirmed it matches the spec's prompt-fragment text.
- [ ] If you skipped a step in this plan, leave a comment on the PR explaining why.
