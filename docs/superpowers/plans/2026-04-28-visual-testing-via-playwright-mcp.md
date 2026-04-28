# Visual Testing via Playwright MCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `@playwright/mcp` into crew-dispatched agents per project, opt-in via TOML, so agents can smoke-verify UI changes and (optionally) author committed Playwright tests against the live deployed container.

**Architecture:** Per-project TOML opt-in (`[visual_testing]`) drives three runtime effects in `crew run`: a generated per-worktree `.mcp.json` exposing the Playwright MCP, a docker-lifecycle change so the stack stays running for the agent, and conditional prompt fragments instructing the agent to use the live URL. Target repos own their `@playwright/test` install; crew validates the contract and fails fast on missing prereqs.

**Tech Stack:** TypeScript, Zod schemas, Vitest, smol-toml, npm workspaces. Existing crew CLI + per-project TOML at `~/.config/crew/projects/<name>.toml`.

**Source spec:** [`docs/superpowers/specs/2026-04-28-visual-testing-via-playwright-mcp-design.md`](../specs/2026-04-28-visual-testing-via-playwright-mcp-design.md). Read it before starting.

**Ticket carve-up** (one Epic + 3 child tickets in CREW + 2 independent prereq tickets in target repos):

| Ticket | Tasks | Blocks |
|---|---|---|
| **CREW-α** (foundation) | Tasks 1-8 | Blocks β, γ |
| **CREW-β** (smoke prompt) | Tasks 9-12 | After α; parallel with γ |
| **CREW-γ** (authored prompt + schema extension) | Tasks 13-16 | After α; parallel with β |
| (Recipes repo, KAN-prereq) | Install `@playwright/test`, `playwright.config.ts`, `tests/e2e/`, `npm run test:e2e` | Independent; required before γ produces value in Recipes |
| (crew dashboard, CREW-prereq) | Same for `packages/dashboard/` | Independent; required before γ produces value for crew's own dashboard |

**Implementation note — module location:** The spec referenced `packages/shared/` for the URL substitution + MCP config builder. In practice, `crew-shared` is currently an unbootstrapped placeholder (only README + package.json), and the existing pattern keeps cross-cutting helpers in `packages/cli/src/lib/<topic>/` (see `cli/src/lib/docker/` for the precedent). This plan keeps visual-testing logic in `packages/cli/src/lib/visual-testing/` for now. When `crew-shared` gets bootstrapped (Phase 1.5 in the architecture doc), this module relocates with no API changes.

---

## CREW-α — Foundation

### Task 1: TOML schema additions

**Files:**
- Modify: `packages/cli/src/lib/config/schema.ts`
- Test: `packages/cli/src/lib/config/loader.test.ts`

- [ ] **Step 1: Write failing tests for the new schema cases**

Append to `packages/cli/src/lib/config/loader.test.ts`:

```ts
describe('parseProjectConfig — visual_testing', () => {
  const baseToml = `
name = "minimal"
repo_path = "/x"

[jira]
project_key = "MIN"
site = "https://x.atlassian.net"

[github]
repo = "owner/repo"
`;

  it('parses with no [visual_testing] section (backwards compatible)', () => {
    const config = parseProjectConfig(baseToml);
    expect(config.visual_testing).toBeUndefined();
  });

  it('parses [visual_testing] with start_command (no docker)', () => {
    const raw = `${baseToml}
[visual_testing]
enabled = true
app_url = "http://localhost:5173"
start_command = "npm run dev"
`;
    const config = parseProjectConfig(raw);
    expect(config.visual_testing?.enabled).toBe(true);
    expect(config.visual_testing?.app_url).toBe('http://localhost:5173');
    expect(config.visual_testing?.start_command).toBe('npm run dev');
  });

  it('parses [visual_testing] with port placeholder + [docker]', () => {
    const raw = `${baseToml}
[docker]
canonical_worktree = "main"

[visual_testing]
enabled = true
app_url = "https://localhost:{httpsPort}"
`;
    const config = parseProjectConfig(raw);
    expect(config.visual_testing?.app_url).toBe('https://localhost:{httpsPort}');
  });

  it('rejects [visual_testing] without app_url', () => {
    const raw = `${baseToml}
[visual_testing]
enabled = true
`;
    expect(() => parseProjectConfig(raw)).toThrow();
  });

  it('rejects [visual_testing] when neither start_command nor [docker] present', () => {
    const raw = `${baseToml}
[visual_testing]
enabled = true
app_url = "http://localhost:5173"
`;
    expect(() => parseProjectConfig(raw)).toThrow(/start_command/);
  });

  it('rejects {httpsPort} placeholder when no [docker] section', () => {
    const raw = `${baseToml}
[visual_testing]
enabled = true
app_url = "https://localhost:{httpsPort}"
start_command = "npm run dev"
`;
    expect(() => parseProjectConfig(raw)).toThrow(/docker/);
  });

  it('parses [visual_testing.authored] sub-table when complete', () => {
    const raw = `${baseToml}
[visual_testing]
enabled = true
app_url = "http://localhost:5173"
start_command = "npm run dev"

[visual_testing.authored]
tests_dir = "tests/e2e"
test_command = "npm run test:e2e"
`;
    const config = parseProjectConfig(raw);
    expect(config.visual_testing?.authored?.tests_dir).toBe('tests/e2e');
    expect(config.visual_testing?.authored?.test_command).toBe('npm run test:e2e');
  });

  // Note: the [visual_testing.authored] partial-rejection case is tested in
  // CREW-γ (Task 13) when the authored sub-table is added to the schema.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- loader.test --run`
Expected: FAIL — `config.visual_testing` is undefined / not in schema.

- [ ] **Step 3: Extend the schema with the visual_testing section + cross-validation refines**

Replace the contents of `packages/cli/src/lib/config/schema.ts` with:

```ts
import { z } from 'zod';

const PORT_PLACEHOLDERS = ['{httpPort}', '{httpsPort}', '{postgresPort}'] as const;

const visualTestingSchema = z.object({
  enabled: z.literal(true),
  app_url: z.string().min(1),
  start_command: z.string().min(1).optional(),
  authored: z
    .object({
      tests_dir: z.string().min(1),
      test_command: z.string().min(1),
    })
    .optional(),
});

export const projectConfigSchema = z
  .object({
    name: z.string(),
    repo_path: z.string(),
    default_branch: z.string().default('main'),
    jira: z.object({
      project_key: z.string(),
      site: z.url(),
    }),
    github: z.object({
      repo: z.string(),
    }),
    docker: z
      .object({
        canonical_worktree: z.string(),
        http_port_base: z.number().default(8000),
        https_port_base: z.number().default(8400),
        postgres_port_base: z.number().default(15400),
      })
      .optional(),
    sandbox: z
      .object({
        allowed_domains: z.array(z.string()),
      })
      .optional(),
    db_clone: z
      .object({
        postgres_service: z.string().default('postgres'),
        postgres_user: z.string().default('postgres'),
        postgres_database: z.string().default('postgres'),
        required_tables: z.array(z.string()).default([]),
        exclude_tables: z.array(z.string()).default(['kysely_migration*']),
      })
      .prefault({}),
    visual_testing: visualTestingSchema.optional(),
  })
  .superRefine((cfg, ctx) => {
    if (!cfg.visual_testing) return;

    const usesPortPlaceholder = PORT_PLACEHOLDERS.some((p) =>
      cfg.visual_testing!.app_url.includes(p),
    );
    if (usesPortPlaceholder && !cfg.docker) {
      ctx.addIssue({
        code: 'custom',
        path: ['visual_testing', 'app_url'],
        message: `app_url uses a port placeholder (${PORT_PLACEHOLDERS.join(', ')}) but no [docker] section is configured`,
      });
    }

    if (!cfg.visual_testing.start_command && !cfg.docker) {
      ctx.addIssue({
        code: 'custom',
        path: ['visual_testing', 'start_command'],
        message:
          'start_command is required when [docker] is not configured (the agent needs a command to bring the app up)',
      });
    }
  });

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- loader.test --run`
Expected: PASS, all new cases green, existing cases still green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/config/schema.ts packages/cli/src/lib/config/loader.test.ts
git commit -m "feat(CREW-α): TOML schema for [visual_testing] opt-in section"
```

---

### Task 2: URL substitution helper

**Files:**
- Create: `packages/cli/src/lib/visual-testing/index.ts`
- Create: `packages/cli/src/lib/visual-testing/resolve-app-url.ts`
- Create: `packages/cli/src/lib/visual-testing/resolve-app-url.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/visual-testing/resolve-app-url.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveAppUrl } from './resolve-app-url.js';

describe('resolveAppUrl', () => {
  it('passes through a URL with no placeholders unchanged', () => {
    const out = resolveAppUrl('http://localhost:5173', undefined);
    expect(out.raw).toBe('http://localhost:5173');
    expect(out.substitutions).toEqual({});
  });

  it('substitutes {httpsPort} when ports are provided', () => {
    const out = resolveAppUrl('https://localhost:{httpsPort}', {
      httpPort: 18000,
      httpsPort: 18443,
      postgresPort: 15400,
    });
    expect(out.raw).toBe('https://localhost:18443');
    expect(out.substitutions).toEqual({ '{httpsPort}': '18443' });
  });

  it('substitutes multiple placeholders in one URL', () => {
    const out = resolveAppUrl('http://localhost:{httpPort}/path?p={postgresPort}', {
      httpPort: 18000,
      httpsPort: 18443,
      postgresPort: 15400,
    });
    expect(out.raw).toBe('http://localhost:18000/path?p=15400');
  });

  it('throws when a known placeholder appears without ports', () => {
    expect(() => resolveAppUrl('https://localhost:{httpsPort}', undefined)).toThrow(
      /port.*not provided/i,
    );
  });

  it('throws on an unknown placeholder', () => {
    expect(() =>
      resolveAppUrl('http://localhost:{nopePort}', {
        httpPort: 18000,
        httpsPort: 18443,
        postgresPort: 15400,
      }),
    ).toThrow(/unknown placeholder/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=crew-cli -- resolve-app-url --run`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `resolveAppUrl`**

Create `packages/cli/src/lib/visual-testing/resolve-app-url.ts`:

```ts
export interface ResolvedAppUrl {
  raw: string;
  substitutions: Record<string, string>;
}

export interface DockerPorts {
  httpPort: number;
  httpsPort: number;
  postgresPort: number;
}

const PLACEHOLDER_TO_PORT_KEY = {
  '{httpPort}': 'httpPort',
  '{httpsPort}': 'httpsPort',
  '{postgresPort}': 'postgresPort',
} as const;

const PLACEHOLDER_RE = /\{[a-zA-Z]+Port\}/g;

export function resolveAppUrl(template: string, ports: DockerPorts | undefined): ResolvedAppUrl {
  const substitutions: Record<string, string> = {};
  const raw = template.replace(PLACEHOLDER_RE, (match) => {
    const key = PLACEHOLDER_TO_PORT_KEY[match as keyof typeof PLACEHOLDER_TO_PORT_KEY];
    if (!key) {
      throw new Error(`resolveAppUrl: unknown placeholder ${match}`);
    }
    if (!ports) {
      throw new Error(`resolveAppUrl: ${match} used but ports were not provided`);
    }
    const value = String(ports[key]);
    substitutions[match] = value;
    return value;
  });
  return { raw, substitutions };
}
```

Create `packages/cli/src/lib/visual-testing/index.ts`:

```ts
export { resolveAppUrl, type ResolvedAppUrl, type DockerPorts } from './resolve-app-url.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- resolve-app-url --run`
Expected: PASS, all 5 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/visual-testing/
git commit -m "feat(CREW-α): resolveAppUrl — port placeholder substitution"
```

---

### Task 3: MCP config builder

**Files:**
- Create: `packages/cli/src/lib/visual-testing/build-mcp-config.ts`
- Create: `packages/cli/src/lib/visual-testing/build-mcp-config.test.ts`
- Modify: `packages/cli/src/lib/visual-testing/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/visual-testing/build-mcp-config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMcpConfig } from './build-mcp-config.js';

describe('buildMcpConfig', () => {
  it('produces a valid Claude Code MCP server config for Playwright', () => {
    const config = buildMcpConfig({ appUrl: 'https://localhost:18443' });
    expect(config).toEqual({
      mcpServers: {
        playwright: {
          command: 'npx',
          args: ['-y', '@playwright/mcp@latest', '--headless'],
          env: { CREW_APP_URL: 'https://localhost:18443' },
        },
      },
    });
  });

  it('serializes to stable JSON (snapshot)', () => {
    const config = buildMcpConfig({ appUrl: 'http://localhost:5173' });
    expect(JSON.stringify(config, null, 2)).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=crew-cli -- build-mcp-config --run`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `buildMcpConfig`**

Create `packages/cli/src/lib/visual-testing/build-mcp-config.ts`:

```ts
export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

export function buildMcpConfig(opts: { appUrl: string }): McpConfig {
  return {
    mcpServers: {
      playwright: {
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest', '--headless'],
        env: { CREW_APP_URL: opts.appUrl },
      },
    },
  };
}
```

Update `packages/cli/src/lib/visual-testing/index.ts`:

```ts
export { resolveAppUrl, type ResolvedAppUrl, type DockerPorts } from './resolve-app-url.js';
export { buildMcpConfig, type McpConfig, type McpServerEntry } from './build-mcp-config.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- build-mcp-config --run`
Expected: PASS, both cases green; snapshot file created on first run.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/visual-testing/
git commit -m "feat(CREW-α): buildMcpConfig — Playwright MCP config builder"
```

---

### Task 4: `.mcp.json` writer + `info/exclude` append

**Files:**
- Create: `packages/cli/src/lib/visual-testing/write-mcp-file.ts`
- Create: `packages/cli/src/lib/visual-testing/write-mcp-file.test.ts`
- Modify: `packages/cli/src/lib/visual-testing/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/visual-testing/write-mcp-file.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMcpFile } from './write-mcp-file.js';

function makeWorktree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crew-mcp-test-'));
  mkdirSync(join(dir, '.git', 'info'), { recursive: true });
  return dir;
}

describe('writeMcpFile', () => {
  it('writes .mcp.json with the supplied config', () => {
    const wt = makeWorktree();
    writeMcpFile(wt, { appUrl: 'https://localhost:18443' });
    const written = JSON.parse(readFileSync(join(wt, '.mcp.json'), 'utf8'));
    expect(written.mcpServers.playwright.env.CREW_APP_URL).toBe('https://localhost:18443');
  });

  it('adds .mcp.json to .git/info/exclude', () => {
    const wt = makeWorktree();
    writeMcpFile(wt, { appUrl: 'http://localhost:5173' });
    const exclude = readFileSync(join(wt, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toMatch(/^\.mcp\.json$/m);
  });

  it('is idempotent — second call does not duplicate the exclude line', () => {
    const wt = makeWorktree();
    writeMcpFile(wt, { appUrl: 'http://localhost:5173' });
    writeMcpFile(wt, { appUrl: 'http://localhost:5173' });
    const exclude = readFileSync(join(wt, '.git', 'info', 'exclude'), 'utf8');
    const matches = exclude.match(/^\.mcp\.json$/gm) ?? [];
    expect(matches.length).toBe(1);
  });

  it('preserves pre-existing exclude entries', () => {
    const wt = makeWorktree();
    writeFileSync(join(wt, '.git', 'info', 'exclude'), 'something-else.txt\n');
    writeMcpFile(wt, { appUrl: 'http://localhost:5173' });
    const exclude = readFileSync(join(wt, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toContain('something-else.txt');
    expect(exclude).toMatch(/^\.mcp\.json$/m);
  });

  it('returns { existed: true } when overwriting a pre-existing .mcp.json', () => {
    const wt = makeWorktree();
    writeFileSync(join(wt, '.mcp.json'), '{"mcpServers":{}}\n');
    const result = writeMcpFile(wt, { appUrl: 'http://localhost:5173' });
    expect(result.existed).toBe(true);
    expect(existsSync(join(wt, '.mcp.json'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=crew-cli -- write-mcp-file --run`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `writeMcpFile`**

Create `packages/cli/src/lib/visual-testing/write-mcp-file.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMcpConfig } from './build-mcp-config.js';

export interface WriteMcpFileResult {
  existed: boolean;
}

const EXCLUDE_LINE = '.mcp.json';

export function writeMcpFile(
  worktreePath: string,
  opts: { appUrl: string },
): WriteMcpFileResult {
  const mcpPath = join(worktreePath, '.mcp.json');
  const existed = existsSync(mcpPath);

  const config = buildMcpConfig({ appUrl: opts.appUrl });
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');

  appendExcludeLine(worktreePath);
  return { existed };
}

function appendExcludeLine(worktreePath: string): void {
  const excludePath = join(worktreePath, '.git', 'info', 'exclude');
  const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
  const lines = current.split('\n');
  if (lines.some((l) => l.trim() === EXCLUDE_LINE)) return;
  const next = current.endsWith('\n') || current.length === 0 ? current : current + '\n';
  writeFileSync(excludePath, next + EXCLUDE_LINE + '\n');
}
```

Update `packages/cli/src/lib/visual-testing/index.ts`:

```ts
export { resolveAppUrl, type ResolvedAppUrl, type DockerPorts } from './resolve-app-url.js';
export { buildMcpConfig, type McpConfig, type McpServerEntry } from './build-mcp-config.js';
export { writeMcpFile, type WriteMcpFileResult } from './write-mcp-file.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- write-mcp-file --run`
Expected: PASS, all 5 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/visual-testing/
git commit -m "feat(CREW-α): writeMcpFile — generate .mcp.json + info/exclude entry"
```

---

### Task 5: Docker bringup `stopAfterBringup` flag

**Files:**
- Modify: `packages/cli/src/commands/run.ts:295-319` (export `buildDockerBringupScript` + add option param)
- Modify: `packages/cli/src/commands/run.test.ts` (add new describe block)

- [ ] **Step 1: Write failing tests**

Append to `packages/cli/src/commands/run.test.ts`:

```ts
import { buildDockerBringupScript } from './run.js';

describe('buildDockerBringupScript', () => {
  it('includes `docker compose stop` when stopAfterBringup is true', () => {
    const script = buildDockerBringupScript('/repo', { stopAfterBringup: true });
    expect(script).toContain('docker compose stop');
    expect(script).toContain('warm-but-stopped');
  });

  it('omits `docker compose stop` when stopAfterBringup is false', () => {
    const script = buildDockerBringupScript('/repo', { stopAfterBringup: false });
    expect(script).not.toContain('docker compose stop');
    expect(script).toContain('leaving stack running');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- run.test --run`
Expected: FAIL — `buildDockerBringupScript` is not exported, and the call signature has only one arg.

- [ ] **Step 3: Add export + the new option, branch the script**

In `packages/cli/src/commands/run.ts`, change the signature at line 295 (currently `function buildDockerBringupScript(repoPath: string): string`) to:

```ts
export interface BringupScriptOptions {
  stopAfterBringup: boolean;
}

export function buildDockerBringupScript(
  repoPath: string,
  opts: BringupScriptOptions,
): string {
  const dbCloneScript = join(repoPath, 'scripts', 'db-clone-from-main.sh');
  const stopBlock = opts.stopAfterBringup
    ? `  echo "[$(date +%T)] docker compose stop (leaving stack warm-but-stopped)"
  docker compose stop 2>&1
  echo "[$(date +%T)] ✓ stack stopped"`
    : `  echo "[$(date +%T)] ✓ leaving stack running for visual testing"`;
  return `set -u
echo "[$(date +%T)] docker compose up --build --detach"
if docker compose up --build --detach 2>&1; then
  echo "[$(date +%T)] ✓ docker stack up"
  if [ -x ${shellQuote(dbCloneScript)} ]; then
    echo "[$(date +%T)] db-clone-from-main"
    if ${shellQuote(dbCloneScript)} 2>&1; then
      echo "[$(date +%T)] ✓ data cloned from main"
    else
      echo "[$(date +%T)] ! data clone skipped (main's stack isn't running)"
    fi
  fi
${stopBlock}
else
  echo "[$(date +%T)] ! docker stack failed to come up"
fi
`;
}
```

Also update the single existing call site in `startDockerBringup()` (around line 274). Replace:

```ts
const script = buildDockerBringupScript(config.repo_path);
```

with:

```ts
const stopAfterBringup = !config.visual_testing?.enabled;
const script = buildDockerBringupScript(config.repo_path, { stopAfterBringup });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- run.test --run`
Expected: PASS for both new cases; existing `runCommand` and `resolveExitCode` cases still green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/run.ts packages/cli/src/commands/run.test.ts
git commit -m "feat(CREW-α): docker bringup leaves stack running when visual testing is on"
```

---

### Task 6: `runTicket` integration — write `.mcp.json` and resolve URL once

**Files:**
- Modify: `packages/cli/src/commands/run.ts` (within `runTicket()`, after the docker `.env` write, before agent spawn)

This task has no new unit-test surface beyond what Task 4 covers — the writes are thin calls into already-tested modules. Integration is verified manually (acceptance criterion in the ticket).

The resolved app URL is computed **once** here and stored in a local variable; Task 7 reuses it when building the prompt to avoid a duplicate call.

- [ ] **Step 1: Add the import**

At the top of `packages/cli/src/commands/run.ts`, add:

```ts
import { resolveAppUrl, writeMcpFile } from '../lib/visual-testing/index.js';
```

- [ ] **Step 2: Refactor the docker block to capture ports + add the visual-testing block**

In `runTicket()`, replace the existing docker block:

```ts
if (config.docker) {
  const env = writeDockerEnv(worktree, { canonicalWorktree: config.docker.canonical_worktree });
  console.log(pc.dim(`→ wrote ${env.envPath}`));
  console.log(pc.dim(`    project: ${env.composeProjectName}`));
  console.log(pc.dim(`    http:    ${env.caddyHttpPort}`));
  console.log(pc.dim(`    https:   ${env.caddyHttpsPort}`));
  console.log(pc.dim(`    pg:      ${env.postgresPort}`));
  console.log(pc.dim(`    url:     ${env.appUrl}`));
}
```

with:

```ts
let dockerPorts: { httpPort: number; httpsPort: number; postgresPort: number } | undefined;
if (config.docker) {
  const env = writeDockerEnv(worktree, { canonicalWorktree: config.docker.canonical_worktree });
  dockerPorts = {
    httpPort: env.caddyHttpPort,
    httpsPort: env.caddyHttpsPort,
    postgresPort: env.postgresPort,
  };
  console.log(pc.dim(`→ wrote ${env.envPath}`));
  console.log(pc.dim(`    project: ${env.composeProjectName}`));
  console.log(pc.dim(`    http:    ${env.caddyHttpPort}`));
  console.log(pc.dim(`    https:   ${env.caddyHttpsPort}`));
  console.log(pc.dim(`    pg:      ${env.postgresPort}`));
  console.log(pc.dim(`    url:     ${env.appUrl}`));
}

let resolvedAppUrl: string | undefined;
if (config.visual_testing?.enabled) {
  const resolved = resolveAppUrl(config.visual_testing.app_url, dockerPorts);
  resolvedAppUrl = resolved.raw;
  const writeResult = writeMcpFile(worktree, { appUrl: resolved.raw });
  console.log(pc.dim(`→ wrote ${join(worktree, '.mcp.json')} (CREW_APP_URL=${resolved.raw})`));
  if (writeResult.existed) {
    console.warn(pc.yellow('  ! .mcp.json already existed in worktree — overwritten'));
  }
}
```

If `writeDockerEnv`'s return shape differs from `{ caddyHttpPort, caddyHttpsPort, postgresPort, ... }`, read `packages/cli/src/lib/docker/env.ts` and use the actual property names.

The new `resolvedAppUrl` local is consumed by Task 7's call to `buildTicketPrompt`. Leave it declared in this commit; the consumer lands in Task 7.

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck --workspace=crew-cli`
Expected: PASS — `resolvedAppUrl` is declared but unused, which TypeScript allows for `let` (no `noUnusedLocals` enforcement). If your `tsconfig.json` flips that flag on, prepend an underscore: `let _resolvedAppUrl: string | undefined;` and rename in Task 7.

Run: `npm test --workspace=crew-cli -- --run`
Expected: PASS, no regressions.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/run.ts
git commit -m "feat(CREW-α): write per-worktree .mcp.json when visual testing is enabled"
```

---

### Task 7: Base prompt template plumbing

**Files:**
- Modify: `packages/cli/src/lib/prompts/templates/ticket.md` (insert one placeholder)
- Modify: `packages/cli/src/lib/prompts/ticket.ts` (extend `BuildTicketPromptOptions` with optional `visualTesting`)
- Modify: `packages/cli/src/lib/prompts/builders.test.ts` (add baseline snapshot test)

This task adds the placeholder and routing without yet rendering any visual-testing content. The slot is ready for β/γ to fill.

- [ ] **Step 1: Write a baseline snapshot test for VT-off**

Append to `packages/cli/src/lib/prompts/builders.test.ts` (in the existing `buildTicketPrompt` describe block):

```ts
it('matches the baseline snapshot when visualTesting is omitted', () => {
  const prompt = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
  });
  expect(prompt).toMatchSnapshot();
});

it('renders identically when visualTesting is undefined as when omitted', () => {
  const a = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
  });
  const b = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
    visualTesting: undefined,
  });
  expect(a).toBe(b);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: FAIL — `visualTesting` is not a valid property on `BuildTicketPromptOptions` (TypeScript error or runtime error from extra-key handling).

- [ ] **Step 3: Add the placeholder + extend the builder**

Modify `packages/cli/src/lib/prompts/templates/ticket.md`. Replace the section header `## Workflow` and the steps that follow it. Find the line:

```markdown
9. **Self-review.** Invoke `superpowers:requesting-code-review`.
```

Insert immediately *before* it (between step 8 "Verify" and step 9 "Self-review"):

Wait — actually, per the spec, the visual-testing block goes **just before "Verify"**, not before Self-review. Re-read: "slotted in just before the existing 'Verify' step." Verify is currently step 8.

Find the line:

```markdown
8. **Verify.** Invoke `superpowers:verification-before-completion`. Run lint / format / typecheck / test:run.
```

Insert immediately *before* it:

```markdown
{{visualTestingBlock}}
```

So the surrounding looks like:

```markdown
7. **Execute, committing per step.** Use `superpowers:test-driven-development`. Frequent small commits referencing `{{key}}`.

{{visualTestingBlock}}

8. **Verify.** Invoke `superpowers:verification-before-completion`. Run lint / format / typecheck / test:run.
```

Replace `packages/cli/src/lib/prompts/ticket.ts` with:

```ts
import { render } from './render.js';

export interface VisualTestingPromptOptions {
  appUrl: string;
  startCommand?: string;
  authored?: {
    testsDir: string;
    testCommand: string;
  };
}

export interface BuildTicketPromptOptions {
  key: string;
  githubRepo: string;
  jiraSite: string;
  visualTesting?: VisualTestingPromptOptions;
}

export function buildTicketPrompt(opts: BuildTicketPromptOptions): string {
  return render('ticket', {
    key: opts.key,
    githubRepo: opts.githubRepo,
    jiraSite: opts.jiraSite,
    visualTestingBlock: buildVisualTestingBlock(opts.visualTesting),
  });
}

function buildVisualTestingBlock(_vt: VisualTestingPromptOptions | undefined): string {
  // β fills the smoke fragment; γ extends with the authored fragment.
  // For α, the placeholder always renders empty.
  return '';
}
```

- [ ] **Step 4: Update the call site in `runTicket` to pass visualTesting (reusing `resolvedAppUrl` from Task 6)**

In `packages/cli/src/commands/run.ts`, find the `buildTicketPrompt({ key, githubRepo, jiraSite })` call (around line 135) and extend it. `resolvedAppUrl` is the local variable populated in Task 6 — reuse it here so we resolve once per run:

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
});
```

(The `&& resolvedAppUrl` guard is belt-and-suspenders for the type narrowing — `resolvedAppUrl` is set whenever `config.visual_testing?.enabled` is true, so they collapse to the same boolean in practice.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: PASS, snapshot file created on first run; all existing builder tests still green.

Run: `npm run typecheck --workspace=crew-cli`
Expected: PASS.

- [ ] **Step 6: Inspect the snapshot diff**

Run: `git diff packages/cli/src/lib/prompts/`
Expected: the prompt template gained one new line `{{visualTestingBlock}}` between steps 7 and 8. The new snapshot should reflect that — an empty placeholder slot. **Important:** since the placeholder renders to an empty string, the rendered prompt should look almost identical to today's. Inspect the snapshot file to confirm. If the existing pre-α snapshot diverges, update it deliberately and verify the only difference is the new blank line (or no difference if `{{visualTestingBlock}}` resolves to an empty string sandwiched between trailing newlines that get collapsed).

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/lib/prompts/ packages/cli/src/commands/run.ts
git commit -m "feat(CREW-α): plumb visualTesting opt through buildTicketPrompt (placeholder, no fragment yet)"
```

---

### Task 8: README — visual-testing setup foundational subsection

**Files:**
- Modify: `README.md` (add a new subsection under `## Setup`)

- [ ] **Step 1: Add the subsection**

In `README.md`, find the line `### GitHub token (once per project)` and insert *before* it (so visual-testing comes between Atlassian MCP and the gh-token section):

````markdown
### Visual testing (per project, optional)

Crew can give the dispatched agent a Playwright-driven browser pointed at the project's running app, so it can smoke-verify UI changes (and optionally author committed Playwright tests). Off by default. Opt in by adding a `[visual_testing]` section to the project's TOML at `~/.config/crew/projects/<name>.toml`:

```toml
[visual_testing]
enabled = true
app_url = "https://localhost:{httpsPort}"   # placeholders {httpPort}, {httpsPort}, {postgresPort} are substituted from the docker .env when [docker] is present
start_command = "npm run dev"               # required when [docker] is not configured
```

When enabled, `crew run`:

- Generates `<worktree>/.mcp.json` declaring the [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp) server (`--headless`). The agent auto-discovers it.
- Adds `.mcp.json` to `<worktree>/.git/info/exclude` so it's never committed.
- Leaves the docker stack **running** (today's default is to stop it after bringup) so the agent has a live URL to test against. You can hit the same URL from your own browser during the run.

When disabled (no `[visual_testing]` section), behaviour is unchanged.

**Headed sessions for ad-hoc browsing.** The generated `.mcp.json` always uses `--headless`. If you want a headed browser when *you* invoke MCP browser tools interactively in a worktree, register a user-scope server (`claude mcp add -s user playwright -- npx -y @playwright/mcp@latest`) — your user-scope settings will take precedence in your interactive session, but the dispatched agent still uses the worktree-scoped headless config.

````

- [ ] **Step 2: Verify the formatting**

Run: `npm run format:check`
Expected: PASS.

If Prettier complains, run `npm run format` and re-stage.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(CREW-α): README — visual-testing per-project setup"
```

---

## CREW-β — Smoke verification prompt fragment

### Task 9: `startCommandHint` helper

**Files:**
- Create: `packages/cli/src/lib/visual-testing/start-command-hint.ts`
- Create: `packages/cli/src/lib/visual-testing/start-command-hint.test.ts`
- Modify: `packages/cli/src/lib/visual-testing/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/visual-testing/start-command-hint.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { startCommandHint } from './start-command-hint.js';

describe('startCommandHint', () => {
  it('returns the docker hint when no startCommand is provided', () => {
    const hint = startCommandHint({ appUrl: 'https://localhost:18443', startCommand: undefined });
    expect(hint).toContain('docker stack is already running');
    expect(hint).toContain('https://localhost:18443');
  });

  it('returns the start_command hint when a startCommand is provided', () => {
    const hint = startCommandHint({
      appUrl: 'http://localhost:5173',
      startCommand: 'npm run dev',
    });
    expect(hint).toContain('npm run dev');
    expect(hint).toContain('Wait for the dev server to be reachable');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- start-command-hint --run`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `startCommandHint`**

Create `packages/cli/src/lib/visual-testing/start-command-hint.ts`:

```ts
export function startCommandHint(opts: {
  appUrl: string;
  startCommand: string | undefined;
}): string {
  if (opts.startCommand) {
    return `Run \`${opts.startCommand}\` in the worktree. Wait for the dev server to be reachable, then proceed.`;
  }
  return `The docker stack is already running — verify with \`curl ${opts.appUrl}\` or just navigate.`;
}
```

Update `packages/cli/src/lib/visual-testing/index.ts`:

```ts
export { resolveAppUrl, type ResolvedAppUrl, type DockerPorts } from './resolve-app-url.js';
export { buildMcpConfig, type McpConfig, type McpServerEntry } from './build-mcp-config.js';
export { writeMcpFile, type WriteMcpFileResult } from './write-mcp-file.js';
export { startCommandHint } from './start-command-hint.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- start-command-hint --run`
Expected: PASS, both cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/visual-testing/
git commit -m "feat(CREW-β): startCommandHint — docker vs vite phrasing helper"
```

---

### Task 10: Smoke fragment template + builder branch

**Files:**
- Create: `packages/cli/src/lib/prompts/templates/ticket-visual-smoke.md`
- Modify: `packages/cli/src/lib/prompts/ticket.ts` (replace the empty `buildVisualTestingBlock` placeholder)
- Modify: `packages/cli/src/lib/prompts/builders.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/cli/src/lib/prompts/builders.test.ts` (inside the `buildTicketPrompt` describe block):

```ts
it('renders the smoke verification section when visualTesting is provided (docker case)', () => {
  const prompt = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
    visualTesting: { appUrl: 'https://localhost:18443' },
  });
  expect(prompt).toContain('Visual smoke verification');
  expect(prompt).toContain('https://localhost:18443');
  expect(prompt).toContain('docker stack is already running');
  expect(prompt).toContain('mcp__playwright__');
  expect(prompt).toMatchSnapshot();
});

it('renders the smoke verification section with start_command hint (non-docker case)', () => {
  const prompt = buildTicketPrompt({
    key: 'CREW-99',
    githubRepo: 'Safturento/crew',
    jiraSite: 'https://safturento.atlassian.net',
    visualTesting: {
      appUrl: 'http://localhost:5173',
      startCommand: 'npm run dev --workspace=crew-dashboard',
    },
  });
  expect(prompt).toContain('http://localhost:5173');
  expect(prompt).toContain('npm run dev --workspace=crew-dashboard');
  expect(prompt).toContain('Wait for the dev server to be reachable');
  expect(prompt).toMatchSnapshot();
});

it('VT-off snapshot still matches Task 7 baseline (no regression from β)', () => {
  const prompt = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
  });
  expect(prompt).toMatchSnapshot();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: FAIL — the visual-testing block still renders empty.

- [ ] **Step 3: Create the smoke fragment template**

Create `packages/cli/src/lib/prompts/templates/ticket-visual-smoke.md`:

```markdown
## Visual smoke verification

This project's UI runs at **{{appUrl}}**. If your changes touch the frontend (any file under a frontend/dashboard package, anything that renders to a DOM, or a backend change a user can observe), you must verify the change end-to-end in a browser before claiming "Verify" complete.

1. Make sure the app is running. {{startCommandHint}}
2. Use the `mcp__playwright__*` tools to navigate to {{appUrl}} and exercise the golden path you changed. Take a screenshot at the relevant state.
3. Inspect the screenshot. If the change is invisible or broken, return to step 7 (Execute) — it isn't done yet.

If your change is *clearly* backend-only (no observable user effect), say so explicitly in the PR description and skip this step.
```

- [ ] **Step 4: Update `buildVisualTestingBlock` to render the smoke fragment**

In `packages/cli/src/lib/prompts/ticket.ts`, replace the existing `buildVisualTestingBlock` function with:

```ts
import { startCommandHint } from '../visual-testing/index.js';

function buildVisualTestingBlock(vt: VisualTestingPromptOptions | undefined): string {
  if (!vt) return '';
  const smoke = render('ticket-visual-smoke', {
    appUrl: vt.appUrl,
    startCommandHint: startCommandHint({
      appUrl: vt.appUrl,
      startCommand: vt.startCommand,
    }),
  });
  // γ will append the authored fragment here when vt.authored is set.
  return smoke;
}
```

(Add the import at the top of the file if not already present. The existing `import { render } from './render.js';` covers the render call.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: PASS for the two new cases (snapshots created on first run); the VT-off baseline must still match Task 7's snapshot.

If the VT-off baseline now differs from Task 7's, the placeholder is collapsing differently in some way. Inspect the diff before accepting the new snapshot — if the difference is meaningful, fix the rendering rather than accepting it.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/prompts/
git commit -m "feat(CREW-β): smoke verification prompt fragment"
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
console.log('=== VT off ===');
console.log(buildTicketPrompt({ key: 'KAN-23', githubRepo: 'Safturento/Recipes', jiraSite: 'https://safturento.atlassian.net' }));
console.log('=== VT smoke (docker) ===');
console.log(buildTicketPrompt({ key: 'KAN-23', githubRepo: 'Safturento/Recipes', jiraSite: 'https://safturento.atlassian.net', visualTesting: { appUrl: 'https://localhost:18443' } }));
"
```

Expected: VT-off output is identical to today's prompt. VT-smoke output has the smoke section between step 7 and step 8, with the docker hint phrasing and the live URL.

- [ ] **Step 2: No commit (this is a manual verification step)**

---

### Task 12: README — smoke section addition

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append to the visual-testing subsection**

Find the closing of the "Visual testing (per project, optional)" subsection (the **Headed sessions for ad-hoc browsing** paragraph). Insert a new paragraph immediately before it:

```markdown
**At agent runtime.** The dispatched agent's prompt instructs it (when `[visual_testing]` is enabled) to navigate to `app_url` after implementing UI-related changes, take a screenshot, and verify the change visually before claiming "Verify" complete. Backend-only changes skip the smoke step with an explicit note in the PR description.

```

- [ ] **Step 2: Format check**

Run: `npm run format:check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(CREW-β): README — smoke verification at agent runtime"
```

---

## CREW-γ — Authored test prompt fragment + schema extension

### Task 13: Schema partial-rejection cases for `[visual_testing.authored]`

The full `[visual_testing.authored]` shape is already in the schema from Task 1 — Task 13 adds the rejection cases for **partial** sub-tables that Task 1 deferred.

**Files:**
- Modify: `packages/cli/src/lib/config/loader.test.ts`
- Modify: `packages/cli/src/lib/config/schema.ts` (only if Task 1's schema accepted partials)

- [ ] **Step 1: Write failing tests**

Append to the `describe('parseProjectConfig — visual_testing', ...)` block in `packages/cli/src/lib/config/loader.test.ts`:

```ts
it('rejects [visual_testing.authored] missing test_command', () => {
  const raw = `
name = "minimal"
repo_path = "/x"

[jira]
project_key = "MIN"
site = "https://x.atlassian.net"

[github]
repo = "owner/repo"

[visual_testing]
enabled = true
app_url = "http://localhost:5173"
start_command = "npm run dev"

[visual_testing.authored]
tests_dir = "tests/e2e"
`;
  expect(() => parseProjectConfig(raw)).toThrow(/test_command/);
});

it('rejects [visual_testing.authored] missing tests_dir', () => {
  const raw = `
name = "minimal"
repo_path = "/x"

[jira]
project_key = "MIN"
site = "https://x.atlassian.net"

[github]
repo = "owner/repo"

[visual_testing]
enabled = true
app_url = "http://localhost:5173"
start_command = "npm run dev"

[visual_testing.authored]
test_command = "npm run test:e2e"
`;
  expect(() => parseProjectConfig(raw)).toThrow(/tests_dir/);
});
```

- [ ] **Step 2: Run tests to verify they pass (or fail)**

Run: `npm test --workspace=crew-cli -- loader.test --run`

If the schema from Task 1 already rejects partials (Zod's default for required fields in nested objects), tests pass — no schema change needed. Skip Step 3.

If they fail, proceed to Step 3.

- [ ] **Step 3: Tighten the schema if needed**

Inspect `packages/cli/src/lib/config/schema.ts:visualTestingSchema.authored`. Both `tests_dir` and `test_command` should be `z.string().min(1)` without `.optional()` on either. If either is optional, remove the `.optional()`.

Re-run Step 2.

- [ ] **Step 4: Commit (only if Step 3 made changes)**

If schema changes were made:

```bash
git add packages/cli/src/lib/config/schema.ts packages/cli/src/lib/config/loader.test.ts
git commit -m "feat(CREW-γ): schema rejects partial [visual_testing.authored]"
```

If only tests were added:

```bash
git add packages/cli/src/lib/config/loader.test.ts
git commit -m "test(CREW-γ): assert schema rejects partial [visual_testing.authored]"
```

---

### Task 14: Authored fragment template + builder branch

**Files:**
- Create: `packages/cli/src/lib/prompts/templates/ticket-visual-authored.md`
- Modify: `packages/cli/src/lib/prompts/ticket.ts` (extend `buildVisualTestingBlock`)
- Modify: `packages/cli/src/lib/prompts/builders.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the `buildTicketPrompt` describe block in `packages/cli/src/lib/prompts/builders.test.ts`:

```ts
it('renders the authored test section after the smoke section when authored is provided', () => {
  const prompt = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
    visualTesting: {
      appUrl: 'https://localhost:18443',
      authored: {
        testsDir: 'tests/e2e',
        testCommand: 'npm run test:e2e',
      },
    },
  });
  expect(prompt).toContain('Visual smoke verification');
  expect(prompt).toContain('Authored Playwright test');
  expect(prompt).toContain('tests/e2e');
  expect(prompt).toContain('npm run test:e2e');

  const smokeIdx = prompt.indexOf('Visual smoke verification');
  const authoredIdx = prompt.indexOf('Authored Playwright test');
  expect(authoredIdx).toBeGreaterThan(smokeIdx);

  expect(prompt).toMatchSnapshot();
});

it('omits the authored section when authored is not set', () => {
  const prompt = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
    visualTesting: { appUrl: 'https://localhost:18443' },
  });
  expect(prompt).toContain('Visual smoke verification');
  expect(prompt).not.toContain('Authored Playwright test');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: FAIL — `authored` rendering doesn't exist.

- [ ] **Step 3: Create the authored fragment template**

Create `packages/cli/src/lib/prompts/templates/ticket-visual-authored.md`:

```markdown

## Authored Playwright test

If the change has regression value (a user-facing flow that broke before or could break again), add a Playwright test:

- Tests live in **{{testsDir}}/**. Mirror existing files there for style.
- Run them with `{{testCommand}}`. The command must pass before "Verify".
- One test per behaviour, not per assertion. Names describe user intent.
- Don't add a test just because you can. Skip when the change is cosmetic, throwaway, or fully covered by existing unit tests.

If `{{testsDir}}/` doesn't exist or `{{testCommand}}` fails because the runner isn't installed, surface the problem in the PR description and do **not** silently skip — that's a project setup gap, not your fault.
```

(Note the leading blank line — keeps a blank between smoke and authored when concatenated.)

- [ ] **Step 4: Extend `buildVisualTestingBlock`**

In `packages/cli/src/lib/prompts/ticket.ts`, replace `buildVisualTestingBlock` with:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- builders --run`
Expected: PASS, all cases green; new snapshots created.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/prompts/
git commit -m "feat(CREW-γ): authored Playwright test prompt fragment"
```

---

### Task 15: Sanity-check the full authored render

**Files:** none — manual inspection step.

- [ ] **Step 1: Print the full rendered prompt with authored set**

```bash
cd /home/safturento/Repos/crew
npx tsx -e "
import { buildTicketPrompt } from './packages/cli/src/lib/prompts/index.js';
console.log(buildTicketPrompt({
  key: 'KAN-23',
  githubRepo: 'Safturento/Recipes',
  jiraSite: 'https://safturento.atlassian.net',
  visualTesting: {
    appUrl: 'https://localhost:18443',
    authored: { testsDir: 'tests/e2e', testCommand: 'npm run test:e2e' }
  }
}));
"
```

Expected: smoke section followed immediately by authored section, both fitting between step 7 and step 8 of the workflow.

- [ ] **Step 2: No commit**

---

### Task 16: README — authored section addition

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append to the visual-testing subsection**

In `README.md`, find the "Visual testing (per project, optional)" subsection. After the **At agent runtime.** paragraph (added in Task 12), append:

````markdown
**Authoring committed Playwright tests.** Add a `[visual_testing.authored]` sub-table to opt the project into authored-test workflow:

```toml
[visual_testing.authored]
tests_dir    = "tests/e2e"
test_command = "npm run test:e2e"
```

Crew does **not** install `@playwright/test` for you — the target repo must have it set up (config + script + folder) before the agent can run authored tests. When the prerequisite is missing, the agent surfaces it in the PR description rather than silently skipping. This matches the convention of keeping target-repo dependencies as a target-repo concern.

````

- [ ] **Step 2: Format check**

Run: `npm run format:check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(CREW-γ): README — authored Playwright test opt-in"
```

---

## After all tasks land

The Epic is complete when CREW-α/β/γ are all merged to `main`. The two target-repo prerequisite tickets (Recipes + crew dashboard `@playwright/test` setup) are independent and may merge before, during, or after the crew epic — they only gate γ's *value* per repo, not γ's merge.

**Manual end-to-end verification** (not enforced by CI, but the acceptance gate per ticket):

- **CREW-α:** in a throwaway worktree, set `enabled = true` in the test project's TOML, run `crew run KAN-XX` against a no-op ticket. Confirm `.mcp.json` exists in the worktree and `.git/info/exclude` contains `.mcp.json`. Confirm the docker stack stays up after bringup completes.
- **CREW-β:** run `crew run KAN-XX` for a UI ticket, watch the agent's transcript. Confirm `mcp__playwright__navigate` is called with the live URL.
- **CREW-γ (after target-repo setup):** run `crew run KAN-XX` for a regression-worthy UI ticket. Confirm a `*.spec.ts` lands in the configured `tests_dir`, and `npm run test:e2e` exits 0 in the agent's PR.

## Self-review checklist for the implementing engineer

Before opening the PR for any ticket:

- [ ] All commit messages are prefixed with the ticket key.
- [ ] No commits on `main` — work happens on the branch named after the ticket key.
- [ ] `npm run lint && npm run format:check && npm run typecheck && npm run test:run` all pass at the repo root.
- [ ] No new Prettier or ESLint warnings.
- [ ] If you added a snapshot, you inspected the snapshot file content and confirmed it matches the spec's prompt-fragment text.
- [ ] If you skipped a step in this plan, leave a comment on the PR explaining why.
