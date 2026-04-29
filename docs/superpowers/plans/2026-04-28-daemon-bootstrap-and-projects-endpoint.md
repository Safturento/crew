# Daemon Bootstrap & `/api/projects` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `packages/daemon/` as a Fastify server exposing `GET /api/projects`, extract the project-config loader to `packages/shared/`, and wire the dashboard's project sections to the real endpoint (replacing the mock client for projects only — agents stay mocked, deferred to a follow-up plan).

**Architecture:** Per the spec at `docs/superpowers/specs/2026-04-28-daemon-bootstrap-and-projects-endpoint-design.md`, this slice aligns with `~/.claude/skills/reaching-for-backend-patterns`: Fastify routes call services that throw typed errors, Awilix DI container, Zod-validated env config, pino logging, Kysely + `kysely-better-sqlite3` for persistence (no tables this slice — only scaffolding). The architecture doc's earlier Hono / raw-better-sqlite3 picks are superseded by this slice; the doc is updated as part of Task 7.

**Tech Stack:** Node 22, TypeScript, Fastify 5, `fastify-type-provider-zod`, Zod 4, `@fastify/awilix`, Awilix 12, pino 9, Kysely + `kysely-better-sqlite3` + `better-sqlite3`, `@fastify/static`, smol-toml (already used by CLI), Vitest, React 19 + Vite 8 + TanStack Query (already used by dashboard).

**Inputs to this plan:**

- Spec: `docs/superpowers/specs/2026-04-28-daemon-bootstrap-and-projects-endpoint-design.md`
- Backend skill: `~/.claude/skills/reaching-for-backend-patterns`
- Existing config module: `packages/cli/src/lib/config/{schema.ts, loader.ts, index.ts}`
- Existing dashboard data layer: `packages/dashboard/src/data/{DaemonClient.ts, MockDaemonClient.ts, types.ts, fixtures.ts}`
- Existing CLI entry: `packages/cli/src/index.ts`

**Out of scope (deferred to slice 1b or later):**

- SQLite tables, DDL, or any migration beyond Kysely's runner being wired up
- chokidar watcher, transcript parser, agent state ingestion
- `POST /api/agents`, `crew run`'s daemon registration, real `/api/agents` data
- SSE / live events
- Any service beyond `ProjectsService`

---

## File structure overview

Files created or modified by this plan:

```
packages/shared/
├── package.json                          # MOD — add deps + scripts
├── tsconfig.json                         # NEW
└── src/
    ├── index.ts                          # NEW — re-exports
    └── config/
        ├── index.ts                      # NEW — barrel
        ├── schema.ts                     # NEW — moved from cli/src/lib/config/schema.ts (verbatim)
        └── loader.ts                     # NEW — moved from cli (minus discoverProjectConfig)

packages/cli/
├── package.json                          # MOD — add crew-shared workspace dep
└── src/
    ├── lib/
    │   ├── config/                       # DELETE the directory
    │   ├── discover-project-config.ts    # NEW — the ex-CLI-only piece (uses execa + git)
    │   └── index.ts                      # MOD — re-export from crew-shared + new file
    ├── commands/
    │   ├── daemon.ts                     # NEW — `crew daemon serve|start|stop|status`
    │   ├── run.ts                        # MOD — import path
    │   ├── list.ts                       # MOD — import path
    │   ├── status.ts                     # MOD — import path
    │   ├── finish.ts                     # MOD — import path
    │   ├── docker-env.ts                 # MOD — import path
    │   └── db-clone.ts                   # MOD — import path
    └── index.ts                          # MOD — register daemonCommand

packages/daemon/
├── package.json                          # MOD — add deps, scripts, bin
├── tsconfig.json                         # NEW
├── vitest.config.ts                      # NEW
└── src/
    ├── index.ts                          # NEW — `crew-daemon` binary entry (calls serve)
    ├── config.ts                         # NEW — Zod env schema parsed at boot
    ├── logger.ts                         # NEW — pino factory
    ├── db.ts                             # NEW — Kysely + better-sqlite3 wiring + migrator
    ├── migrations/                       # NEW — empty dir + .gitkeep
    ├── container.ts                      # NEW — Awilix container setup
    ├── errors.ts                         # NEW — typed error classes
    ├── app.ts                            # NEW — Fastify app factory
    ├── serve.ts                          # NEW — main entry: build + listen
    ├── routes/
    │   └── projects.ts                   # NEW — GET /api/projects
    ├── services/
    │   └── ProjectsService.ts            # NEW
    └── test/
        └── tmpdir.ts                     # NEW — tmpdir fixture helper

packages/dashboard/
├── vite.config.ts                        # MOD — add /api proxy
├── src/data/
│   ├── HttpProjectsClient.ts             # NEW
│   ├── HttpProjectsClient.test.ts        # NEW
│   ├── HybridDaemonClient.ts             # NEW
│   └── HybridDaemonClient.test.ts        # NEW
├── src/App.tsx                           # MOD — defaultClient swap
└── src/App.test.tsx                      # MOD — inject hybrid client

docs/plans/architecture.md                # MOD — Phase 2 stack supersession note
```

Each task below produces a self-contained, committable change.

---

## Task 1: Extract `config/` to `crew-shared`

**Files:**
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/config/index.ts`
- Create: `packages/shared/src/config/schema.ts`
- Create: `packages/shared/src/config/loader.ts`
- Modify: `packages/shared/package.json`
- Create: `packages/cli/src/lib/discover-project-config.ts`
- Create: `packages/cli/src/lib/discover-project-config.test.ts` (move from existing config/loader.test.ts subset)
- Move: `packages/shared/src/config/loader.test.ts` (subset of existing config/loader.test.ts)
- Delete: `packages/cli/src/lib/config/` (whole directory)
- Modify: `packages/cli/src/lib/index.ts`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/cli/src/commands/list.ts`
- Modify: `packages/cli/src/commands/status.ts`
- Modify: `packages/cli/src/commands/finish.ts`
- Modify: `packages/cli/src/commands/docker-env.ts`
- Modify: `packages/cli/src/commands/db-clone.ts`
- Modify: `packages/cli/src/commands/db-clone.test.ts`
- Modify: `packages/cli/src/commands/docker-env.test.ts`
- Modify: `packages/cli/src/commands/finish.test.ts`

- [ ] **Step 1: Update `packages/shared/package.json`**

Replace the file contents with:

```json
{
  "name": "crew-shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Shared modules used by crew-cli and crew-daemon (config schema + loader, etc).",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./config": "./src/config/index.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "smol-toml": "^1.6.1",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^25.6.0",
    "vitest": "^4.1.5"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/shared/src/config/schema.ts` (verbatim copy of CLI's current `schema.ts`)**

Copy the **entire contents** of `packages/cli/src/lib/config/schema.ts` into `packages/shared/src/config/schema.ts`. No edits — same file, new home.

- [ ] **Step 4: Create `packages/shared/src/config/loader.ts` (CLI's loader minus `discoverProjectConfig`)**

```typescript
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseToml } from 'smol-toml';
import { projectConfigSchema, type ProjectConfig } from './schema.js';

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'crew', 'projects');

/**
 * Parse a TOML config string and validate against the project-config schema.
 * Throws on invalid TOML or schema violations.
 */
export function parseProjectConfig(raw: string): ProjectConfig {
  const parsed = parseToml(raw);
  return projectConfigSchema.parse(parsed);
}

/**
 * Load a named project config from a directory (defaults to ~/.config/crew/projects/).
 */
export function loadProjectConfigByName(name: string, configDir = DEFAULT_CONFIG_DIR): ProjectConfig {
  const path = join(configDir, `${name}.toml`);
  if (!existsSync(path)) {
    throw new Error(`no project config at ${path}`);
  }
  return parseProjectConfig(readFileSync(path, 'utf8'));
}

export { DEFAULT_CONFIG_DIR };
```

Note the `configDir` parameter — it lets the daemon (and tests) point at a different directory without monkey-patching `homedir()`.

- [ ] **Step 5: Create `packages/shared/src/config/index.ts`**

```typescript
export * from './schema.js';
export * from './loader.js';
```

- [ ] **Step 6: Create `packages/shared/src/index.ts`**

```typescript
export * from './config/index.js';
```

- [ ] **Step 7: Move existing CLI loader tests into shared (the subset that doesn't test `discoverProjectConfig`)**

Read the existing tests at `packages/cli/src/lib/config/loader.test.ts`. Identify which `describe`/`it` blocks cover `parseProjectConfig` and `loadProjectConfigByName` (vs `discoverProjectConfig`). Copy those blocks into a new file `packages/shared/src/config/loader.test.ts` with imports updated:

```typescript
import { describe, it, expect } from 'vitest';
import { parseProjectConfig, loadProjectConfigByName } from './loader.js';
// ... rest of the relevant test bodies, unchanged
```

- [ ] **Step 8: Run shared tests to verify the moved tests pass**

```bash
npm run test:run --workspace=crew-shared
```

Expected: all tests pass.

- [ ] **Step 9: Create `packages/cli/src/lib/discover-project-config.ts`**

```typescript
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execa } from 'execa';
import { parseProjectConfig, type ProjectConfig } from 'crew-shared';

const CONFIG_DIR = join(homedir(), '.config', 'crew', 'projects');

/**
 * Auto-discover the project config that matches the current cwd. Walks up to
 * find a .git directory, reads the origin URL, and returns the first config
 * in ~/.config/crew/projects/*.toml whose github.repo matches. Returns null
 * if no match.
 */
export async function discoverProjectConfig(cwd: string): Promise<ProjectConfig | null> {
  const remoteUrl = await execa('git', ['-C', cwd, 'remote', 'get-url', 'origin'])
    .then((r) => r.stdout.trim())
    .catch(() => '');
  if (!remoteUrl) return null;

  const repoSlug = parseGithubSlug(remoteUrl);
  if (!repoSlug) return null;

  if (!existsSync(CONFIG_DIR)) return null;
  for (const file of readdirSync(CONFIG_DIR)) {
    if (!file.endsWith('.toml')) continue;
    try {
      const config = parseProjectConfig(readFileSync(join(CONFIG_DIR, file), 'utf8'));
      if (config.github.repo === repoSlug) return config;
    } catch {
      // skip files that don't parse
    }
  }
  return null;
}

function parseGithubSlug(remoteUrl: string): string | null {
  // git@github.com:owner/repo.git → owner/repo
  // https://github.com/owner/repo.git → owner/repo
  const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/);
  return match?.[1] ?? null;
}
```

- [ ] **Step 10: Move `discoverProjectConfig` tests**

Copy the `discoverProjectConfig` tests from `packages/cli/src/lib/config/loader.test.ts` into a new file `packages/cli/src/lib/discover-project-config.test.ts`, updating the import to `./discover-project-config.js`. Remove the moved blocks (and the now-empty file) from `cli/src/lib/config/`.

- [ ] **Step 11: Update `packages/cli/package.json` to add the workspace dep on `crew-shared`**

In the `dependencies` block, add:

```json
"crew-shared": "*",
```

Then run from the repo root:

```bash
npm install
```

This wires the workspace symlink.

- [ ] **Step 12: Update `packages/cli/src/lib/index.ts` to re-export from `crew-shared` and from the new file**

Replace the `./config/index.js` export line with:

```typescript
export * from 'crew-shared';
export * from './discover-project-config.js';
```

(Other lines unchanged.)

- [ ] **Step 13: Update direct config imports in CLI commands**

In each of these files, change `from '../lib/config/index.js'` (or any equivalent) to `from '../lib/index.js'`:

- `packages/cli/src/commands/run.ts`

(All other commands already import from `../lib/index.js` per the `grep` we ran during planning, so the barrel re-export covers them.)

- [ ] **Step 14: Delete the old `packages/cli/src/lib/config/` directory**

```bash
rm -rf packages/cli/src/lib/config
```

- [ ] **Step 15: Run all CLI + shared tests to verify the extraction**

```bash
npm run test:run
```

Expected: all tests pass (CLI tests now resolve `ProjectConfig`/`parseProjectConfig`/etc through `crew-shared`).

- [ ] **Step 16: Typecheck the workspace**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 17: Commit**

```bash
git add packages/shared packages/cli
git commit -m "refactor: extract project-config loader from cli to crew-shared (CREW-XX)"
```

> **Note:** The actual ticket key is filled in when this becomes a Jira ticket; the planning step numbers them as Task N for now.

---

## Task 2: Daemon bootstrap (Fastify + Awilix + pino + Zod env + Kysely scaffolding)

**Files:**
- Modify: `packages/daemon/package.json`
- Create: `packages/daemon/tsconfig.json`
- Create: `packages/daemon/vitest.config.ts`
- Create: `packages/daemon/src/config.ts`
- Create: `packages/daemon/src/config.test.ts`
- Create: `packages/daemon/src/logger.ts`
- Create: `packages/daemon/src/db.ts`
- Create: `packages/daemon/src/migrations/.gitkeep`
- Create: `packages/daemon/src/errors.ts`
- Create: `packages/daemon/src/container.ts`
- Create: `packages/daemon/src/app.ts`
- Create: `packages/daemon/src/app.test.ts`
- Create: `packages/daemon/src/serve.ts`
- Create: `packages/daemon/src/index.ts`
- Create: `packages/daemon/src/test/tmpdir.ts`

- [ ] **Step 1: Update `packages/daemon/package.json`**

```json
{
  "name": "crew-daemon",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "crew's state-tracking daemon — Fastify HTTP server.",
  "main": "./src/index.ts",
  "bin": {
    "crew-daemon": "./bin/crew-daemon"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest",
    "test:run": "vitest run",
    "dev": "tsx src/serve.ts"
  },
  "dependencies": {
    "@fastify/awilix": "^9.0.0",
    "@fastify/static": "^9.0.0",
    "awilix": "^12.0.0",
    "better-sqlite3": "^12.0.0",
    "crew-shared": "*",
    "fastify": "^5.0.0",
    "fastify-type-provider-zod": "^6.0.0",
    "kysely": "^0.28.0",
    "pino": "^9.0.0",
    "pino-pretty": "^13.0.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^8.0.0",
    "@types/node": "^25.6.0",
    "tsx": "^4.21.0",
    "vitest": "^4.1.5"
  }
}
```

Then from the repo root:

```bash
npm install
```

- [ ] **Step 2: Create `packages/daemon/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/daemon/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
```

- [ ] **Step 4: Write the failing test for the env-config schema**

Create `packages/daemon/src/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseDaemonConfig } from './config.js';

describe('parseDaemonConfig', () => {
  it('uses defaults when env is empty', () => {
    const config = parseDaemonConfig({});
    expect(config.port).toBe(7773);
    expect(config.configDir).toMatch(/\/\.config\/crew$/);
    expect(config.dbFile).toMatch(/\/state\.db$/);
    expect(config.pidFile).toMatch(/\/daemon\.pid$/);
    expect(config.logFile).toMatch(/\/daemon\.log$/);
  });

  it('respects CREW_PORT', () => {
    const config = parseDaemonConfig({ CREW_PORT: '9999' });
    expect(config.port).toBe(9999);
  });

  it('respects CREW_CONFIG_DIR and derives sub-paths from it', () => {
    const config = parseDaemonConfig({ CREW_CONFIG_DIR: '/tmp/xyz' });
    expect(config.configDir).toBe('/tmp/xyz');
    expect(config.dbFile).toBe('/tmp/xyz/state.db');
    expect(config.pidFile).toBe('/tmp/xyz/daemon.pid');
    expect(config.logFile).toBe('/tmp/xyz/daemon.log');
  });

  it('throws on non-numeric CREW_PORT', () => {
    expect(() => parseDaemonConfig({ CREW_PORT: 'banana' })).toThrow();
  });
});
```

- [ ] **Step 5: Run config test to verify it fails**

```bash
npm run test:run --workspace=crew-daemon
```

Expected: FAIL — `parseDaemonConfig` does not exist.

- [ ] **Step 6: Implement `packages/daemon/src/config.ts`**

```typescript
import { z } from 'zod';
import { join } from 'node:path';
import { homedir } from 'node:os';

const RawSchema = z.object({
  CREW_PORT: z.coerce.number().int().positive().optional(),
  CREW_CONFIG_DIR: z.string().min(1).optional(),
  CREW_DB_FILE: z.string().min(1).optional(),
  CREW_PID_FILE: z.string().min(1).optional(),
  CREW_LOG_FILE: z.string().min(1).optional(),
});

export type DaemonConfig = {
  port: number;
  configDir: string;
  dbFile: string;
  pidFile: string;
  logFile: string;
  projectsDir: string;
};

export function parseDaemonConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): DaemonConfig {
  const raw = RawSchema.parse(env);
  const configDir = raw.CREW_CONFIG_DIR ?? join(homedir(), '.config', 'crew');
  return {
    port: raw.CREW_PORT ?? 7773,
    configDir,
    dbFile: raw.CREW_DB_FILE ?? join(configDir, 'state.db'),
    pidFile: raw.CREW_PID_FILE ?? join(configDir, 'daemon.pid'),
    logFile: raw.CREW_LOG_FILE ?? join(configDir, 'daemon.log'),
    projectsDir: join(configDir, 'projects'),
  };
}
```

- [ ] **Step 7: Run config test to verify it passes**

```bash
npm run test:run --workspace=crew-daemon
```

Expected: PASS.

- [ ] **Step 8: Create `packages/daemon/src/logger.ts`**

```typescript
import { pino, type Logger } from 'pino';

export type LoggerOptions = {
  destination?: string; // file path; if absent, logs to stdout (pretty in TTY)
  level?: pino.Level;
};

export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.level ?? 'info';
  if (opts.destination) {
    return pino({ level }, pino.destination({ dest: opts.destination, sync: false, mkdir: true }));
  }
  if (process.stdout.isTTY) {
    return pino({
      level,
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
    });
  }
  return pino({ level });
}
```

- [ ] **Step 9: Create `packages/daemon/src/errors.ts`**

```typescript
export class ConfigDirNotFoundError extends Error {
  constructor(public path: string) {
    super(`crew config directory not found at ${path}`);
    this.name = 'ConfigDirNotFoundError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
```

(More error classes added as services need them in subsequent slices.)

- [ ] **Step 10: Create `packages/daemon/src/db.ts`**

```typescript
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, Migrator, FileMigrationProvider } from 'kysely';
import { promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Empty database type — populated as 1b's migrations introduce tables.
export type Database = Record<string, never>;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

export function openDb(dbFile: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new Database(dbFile) }),
  });
}

export async function runMigrations(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs: fsp,
      path: { join },
      migrationFolder: MIGRATIONS_DIR,
    }),
  });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;
  // results may be empty in slice 1a — that's fine.
  return;
}
```

- [ ] **Step 11: Create the empty migrations directory**

```bash
mkdir -p packages/daemon/src/migrations
touch packages/daemon/src/migrations/.gitkeep
```

- [ ] **Step 12: Create `packages/daemon/src/container.ts`**

```typescript
import { asValue, asClass, createContainer, type AwilixContainer } from 'awilix';
import type { Logger } from 'pino';
import type { Kysely } from 'kysely';
import type { DaemonConfig } from './config.js';
import type { Database } from './db.js';

export type Cradle = {
  config: DaemonConfig;
  logger: Logger;
  db: Kysely<Database>;
  // services registered in routes/services tasks below
};

export function buildContainer(deps: {
  config: DaemonConfig;
  logger: Logger;
  db: Kysely<Database>;
}): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>({ injectionMode: 'PROXY', strict: true });
  container.register({
    config: asValue(deps.config),
    logger: asValue(deps.logger),
    db: asValue(deps.db),
  });
  return container;
}
```

- [ ] **Step 13: Write the failing test for the Fastify app factory**

Create `packages/daemon/src/app.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from './app.js';
import { buildContainer } from './container.js';
import { parseDaemonConfig } from './config.js';
import { createLogger } from './logger.js';
import { openDb } from './db.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'crew-daemon-'));
  tmpdirs.push(dir);
  const config = parseDaemonConfig({ CREW_CONFIG_DIR: dir });
  const logger = createLogger({ level: 'silent' });
  const db = openDb(config.dbFile);
  const container = buildContainer({ config, logger, db });
  return { config, container, db };
}

describe('buildApp', () => {
  it('responds to GET /health with { ok: true }', async () => {
    const { container, db } = setup();
    const app = await buildApp({ container });
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns 404 for unknown routes (default Fastify behaviour)', async () => {
    const { container, db } = setup();
    const app = await buildApp({ container });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/unknown' });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});
```

- [ ] **Step 14: Run app test to verify it fails**

```bash
npm run test:run --workspace=crew-daemon
```

Expected: FAIL — `buildApp` does not exist.

- [ ] **Step 15: Implement `packages/daemon/src/app.ts`**

```typescript
import Fastify, { type FastifyInstance } from 'fastify';
import { fastifyAwilixPlugin } from '@fastify/awilix';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AwilixContainer } from 'awilix';
import type { Cradle } from './container.js';
import { ConfigDirNotFoundError, NotFoundError } from './errors.js';

export async function buildApp(opts: { container: AwilixContainer<Cradle> }): Promise<FastifyInstance> {
  const logger = opts.container.cradle.logger;
  const app = Fastify({ loggerInstance: logger }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifyAwilixPlugin, {
    container: opts.container,
    asyncInit: false,
    asyncDispose: false,
    disposeOnClose: false,
    disposeOnResponse: false,
    strictBooleanEnforced: true,
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
    if (err instanceof ConfigDirNotFoundError)
      return reply.code(500).send({ error: 'config_dir_missing', path: err.path });
    if ('validation' in err && err.validation)
      return reply.code(400).send({ error: 'invalid_input', details: err.validation });
    app.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'internal_error' });
  });

  app.get('/health', async () => ({ ok: true }));

  return app;
}
```

- [ ] **Step 16: Run app tests to verify they pass**

```bash
npm run test:run --workspace=crew-daemon
```

Expected: PASS for both `buildApp` tests.

- [ ] **Step 17: Create `packages/daemon/src/serve.ts`**

```typescript
import { parseDaemonConfig } from './config.js';
import { createLogger } from './logger.js';
import { openDb, runMigrations } from './db.js';
import { buildContainer } from './container.js';
import { buildApp } from './app.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export async function startDaemon(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = parseDaemonConfig(env);
  mkdirSync(config.configDir, { recursive: true });
  mkdirSync(dirname(config.dbFile), { recursive: true });

  const logger = createLogger({
    destination: process.stdout.isTTY ? undefined : config.logFile,
  });
  const db = openDb(config.dbFile);
  await runMigrations(db);

  const container = buildContainer({ config, logger, db });
  const app = await buildApp({ container });

  const onShutdown = async () => {
    logger.info('shutting down');
    await app.close();
    await db.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', onShutdown);
  process.on('SIGINT', onShutdown);

  await app.listen({ host: '127.0.0.1', port: config.port });
  logger.info({ port: config.port }, 'crew daemon listening');
}
```

- [ ] **Step 18: Create `packages/daemon/src/index.ts`**

```typescript
export { startDaemon } from './serve.js';
export { buildApp } from './app.js';
export { parseDaemonConfig, type DaemonConfig } from './config.js';
export { buildContainer, type Cradle } from './container.js';
export { openDb, runMigrations, type Database } from './db.js';
```

- [ ] **Step 19: Create `packages/daemon/src/test/tmpdir.ts`**

```typescript
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

export function useTmpDir(prefix = 'crew-daemon-'): () => string {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  return () => {
    const d = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(d);
    return d;
  };
}
```

- [ ] **Step 20: Smoke-run the daemon manually (optional sanity check)**

```bash
CREW_CONFIG_DIR=/tmp/crew-smoke npm run dev --workspace=crew-daemon &
sleep 1
curl -s http://localhost:7773/health
kill %1
```

Expected: `{"ok":true}`. Then clean up: `rm -rf /tmp/crew-smoke`.

- [ ] **Step 21: Run the full daemon test suite**

```bash
npm run test:run --workspace=crew-daemon
```

Expected: PASS.

- [ ] **Step 22: Typecheck**

```bash
npm run typecheck --workspace=crew-daemon
```

Expected: no errors.

- [ ] **Step 23: Commit**

```bash
git add packages/daemon
git commit -m "feat(daemon): bootstrap fastify app with awilix, pino, zod env, kysely scaffolding (CREW-XX)"
```

---

## Task 3: `ProjectsService` + `GET /api/projects`

**Files:**
- Create: `packages/daemon/src/services/ProjectsService.ts`
- Create: `packages/daemon/src/services/ProjectsService.test.ts`
- Create: `packages/daemon/src/routes/projects.ts`
- Create: `packages/daemon/src/routes/projects.test.ts`
- Modify: `packages/daemon/src/container.ts`
- Modify: `packages/daemon/src/app.ts`

- [ ] **Step 1: Write the failing test for `ProjectsService.list`**

Create `packages/daemon/src/services/ProjectsService.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ProjectsService } from './ProjectsService.js';
import { useTmpDir } from '../test/tmpdir.js';
import { createLogger } from '../logger.js';

const tmp = useTmpDir();
const silentLogger = createLogger({ level: 'silent' });

const validToml = (name: string, repoPath: string) => `
name = "${name}"
repo_path = "${repoPath}"

[jira]
project_key = "KAN"
site = "https://example.atlassian.net"

[github]
repo = "example/${name}"
`;

function projectsDir(): string {
  const dir = join(tmp(), 'projects');
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('ProjectsService.list', () => {
  it('returns projects from valid TOML files, alphabetized by name', () => {
    const dir = projectsDir();
    writeFileSync(join(dir, 'zeta.toml'), validToml('zeta', '/tmp/zeta'));
    writeFileSync(join(dir, 'alpha.toml'), validToml('alpha', '/tmp/alpha'));

    const svc = new ProjectsService({ projectsDir: dir, logger: silentLogger });
    expect(svc.list()).toEqual([
      { name: 'alpha', repoPath: '/tmp/alpha' },
      { name: 'zeta', repoPath: '/tmp/zeta' },
    ]);
  });

  it('skips invalid TOMLs and logs a warning, returning the valid ones', () => {
    const dir = projectsDir();
    writeFileSync(join(dir, 'good.toml'), validToml('good', '/tmp/good'));
    writeFileSync(join(dir, 'broken.toml'), 'this = is not [valid toml');
    const warn = vi.fn();
    const svc = new ProjectsService({
      projectsDir: dir,
      logger: { ...silentLogger, warn } as never,
    });
    expect(svc.list()).toEqual([{ name: 'good', repoPath: '/tmp/good' }]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('returns empty array when projects dir does not exist', () => {
    const svc = new ProjectsService({ projectsDir: join(tmp(), 'absent'), logger: silentLogger });
    expect(svc.list()).toEqual([]);
  });

  it('ignores non-.toml files', () => {
    const dir = projectsDir();
    writeFileSync(join(dir, 'good.toml'), validToml('good', '/tmp/good'));
    writeFileSync(join(dir, 'README.md'), 'hello');
    const svc = new ProjectsService({ projectsDir: dir, logger: silentLogger });
    expect(svc.list()).toEqual([{ name: 'good', repoPath: '/tmp/good' }]);
  });
});
```

- [ ] **Step 2: Run service test to verify it fails**

```bash
npm run test:run --workspace=crew-daemon
```

Expected: FAIL — `ProjectsService` does not exist.

- [ ] **Step 3: Implement `packages/daemon/src/services/ProjectsService.ts`**

```typescript
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from 'pino';
import { parseProjectConfig } from 'crew-shared';

export type ProjectSummary = {
  name: string;
  repoPath: string;
};

export class ProjectsService {
  private readonly projectsDir: string;
  private readonly logger: Logger;

  constructor(deps: { projectsDir: string; logger: Logger }) {
    this.projectsDir = deps.projectsDir;
    this.logger = deps.logger;
  }

  list(): ProjectSummary[] {
    if (!existsSync(this.projectsDir)) return [];
    const projects: ProjectSummary[] = [];
    for (const file of readdirSync(this.projectsDir)) {
      if (!file.endsWith('.toml')) continue;
      const path = join(this.projectsDir, file);
      try {
        const cfg = parseProjectConfig(readFileSync(path, 'utf8'));
        projects.push({ name: cfg.name, repoPath: cfg.repo_path });
      } catch (err) {
        this.logger.warn({ path, err }, 'skipping invalid project TOML');
      }
    }
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }
}
```

- [ ] **Step 4: Run service test to verify it passes**

```bash
npm run test:run --workspace=crew-daemon -- ProjectsService
```

Expected: PASS for all four cases.

- [ ] **Step 5: Register `ProjectsService` in the Awilix container**

Edit `packages/daemon/src/container.ts`. Update the `Cradle` type and the registrations:

```typescript
import { asValue, asClass, asFunction, createContainer, type AwilixContainer } from 'awilix';
import type { Logger } from 'pino';
import type { Kysely } from 'kysely';
import type { DaemonConfig } from './config.js';
import type { Database } from './db.js';
import { ProjectsService } from './services/ProjectsService.js';

export type Cradle = {
  config: DaemonConfig;
  logger: Logger;
  db: Kysely<Database>;
  projectsService: ProjectsService;
};

export function buildContainer(deps: {
  config: DaemonConfig;
  logger: Logger;
  db: Kysely<Database>;
}): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>({ injectionMode: 'PROXY', strict: true });
  container.register({
    config: asValue(deps.config),
    logger: asValue(deps.logger),
    db: asValue(deps.db),
    projectsService: asFunction(
      ({ config, logger }: Cradle) =>
        new ProjectsService({ projectsDir: config.projectsDir, logger }),
    ).scoped(),
  });
  return container;
}
```

- [ ] **Step 6: Write the failing route test for `GET /api/projects`**

Create `packages/daemon/src/routes/projects.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import { buildContainer } from '../container.js';
import { parseDaemonConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { openDb } from '../db.js';
import { useTmpDir } from '../test/tmpdir.js';

const tmp = useTmpDir();
const silentLogger = createLogger({ level: 'silent' });

const validToml = (name: string, repoPath: string) => `
name = "${name}"
repo_path = "${repoPath}"

[jira]
project_key = "KAN"
site = "https://example.atlassian.net"

[github]
repo = "example/${name}"
`;

async function setup() {
  const dir = tmp();
  mkdirSync(join(dir, 'projects'), { recursive: true });
  const config = parseDaemonConfig({ CREW_CONFIG_DIR: dir });
  const db = openDb(config.dbFile);
  const container = buildContainer({ config, logger: silentLogger, db });
  const app = await buildApp({ container });
  return { app, db, dir };
}

describe('GET /api/projects', () => {
  it('returns the projects array', async () => {
    const { app, db, dir } = await setup();
    try {
      writeFileSync(join(dir, 'projects', 'kan.toml'), validToml('kanban-api', '/code/kanban-api'));
      const res = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        projects: [{ name: 'kanban-api', repoPath: '/code/kanban-api' }],
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns empty list when no projects are registered', async () => {
    const { app, db } = await setup();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ projects: [] });
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});
```

- [ ] **Step 7: Run route test to verify it fails**

```bash
npm run test:run --workspace=crew-daemon -- routes/projects
```

Expected: FAIL — route returns 404 (not registered).

- [ ] **Step 8: Implement the route at `packages/daemon/src/routes/projects.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const ProjectSchema = z.object({
  name: z.string(),
  repoPath: z.string(),
});

const ProjectsResponseSchema = z.object({
  projects: z.array(ProjectSchema),
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectsResponse = z.infer<typeof ProjectsResponseSchema>;

export async function registerProjectsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/projects',
    {
      schema: { response: { 200: ProjectsResponseSchema } },
    },
    async (req) => {
      const svc = req.diScope.resolve('projectsService');
      return { projects: svc.list() };
    },
  );
}
```

- [ ] **Step 9: Wire the route into `buildApp`**

Edit `packages/daemon/src/app.ts`. Add the import and call:

```typescript
import { registerProjectsRoutes } from './routes/projects.js';
```

Then inside `buildApp`, after the `setErrorHandler` block and before the `app.get('/health', ...)` line, add:

```typescript
  await registerProjectsRoutes(app);
```

- [ ] **Step 10: Run route tests to verify they pass**

```bash
npm run test:run --workspace=crew-daemon -- routes/projects
```

Expected: PASS for both cases.

- [ ] **Step 11: Run all daemon tests**

```bash
npm run test:run --workspace=crew-daemon
```

Expected: PASS for everything.

- [ ] **Step 12: Manual smoke test**

```bash
mkdir -p /tmp/crew-smoke/projects
cat > /tmp/crew-smoke/projects/demo.toml <<'EOF'
name = "demo"
repo_path = "/code/demo"

[jira]
project_key = "DEMO"
site = "https://example.atlassian.net"

[github]
repo = "example/demo"
EOF
CREW_CONFIG_DIR=/tmp/crew-smoke npm run dev --workspace=crew-daemon &
sleep 1
curl -s http://localhost:7773/api/projects
kill %1
rm -rf /tmp/crew-smoke
```

Expected: `{"projects":[{"name":"demo","repoPath":"/code/demo"}]}`.

- [ ] **Step 13: Commit**

```bash
git add packages/daemon
git commit -m "feat(daemon): GET /api/projects via ProjectsService (CREW-XX)"
```

---

## Task 4: `crew daemon serve|start|stop|status` lifecycle commands

**Files:**
- Create: `packages/cli/src/commands/daemon.ts`
- Create: `packages/cli/src/commands/daemon.test.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json` (add `crew-daemon` workspace dep)

- [ ] **Step 1: Add the daemon workspace dep to the CLI**

Edit `packages/cli/package.json`. In `dependencies`, add:

```json
"crew-daemon": "*",
```

Then from the repo root:

```bash
npm install
```

- [ ] **Step 2: Write the failing unit test for the daemon command's PID-file helpers**

Create `packages/cli/src/commands/daemon.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPid, writePid, removePid, isProcessAlive } from './daemon.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'crew-cli-test-'));
  dirs.push(d);
  return d;
}

describe('PID file helpers', () => {
  it('readPid returns null when file is absent', () => {
    expect(readPid(join(tmp(), 'missing.pid'))).toBeNull();
  });

  it('writePid + readPid round-trip', () => {
    const path = join(tmp(), 'daemon.pid');
    writePid(path, 12345);
    expect(readPid(path)).toBe(12345);
  });

  it('readPid returns null and removes the file on garbage contents', () => {
    const path = join(tmp(), 'daemon.pid');
    writeFileSync(path, 'not-a-number');
    expect(readPid(path)).toBeNull();
    expect(existsSync(path)).toBe(false);
  });

  it('removePid is a no-op when file is absent', () => {
    expect(() => removePid(join(tmp(), 'missing.pid'))).not.toThrow();
  });

  it('isProcessAlive returns true for the current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('isProcessAlive returns false for an obviously-dead PID', () => {
    // PID 1 exists; using a high PID that's almost certainly free.
    expect(isProcessAlive(2 ** 22)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:run --workspace=crew-cli -- daemon
```

Expected: FAIL — module/exports do not exist.

- [ ] **Step 4: Implement `packages/cli/src/commands/daemon.ts`**

The `start` subcommand has to spawn a *detached* child running `crew daemon serve`. The CLI itself runs via tsx through the bash shim at `packages/cli/bin/crew`, so `process.argv[1]` points at `src/index.ts` (not the bash entry) and `process.execPath` is plain `node` — spawning those directly would feed a `.ts` file to a non-tsx node. The fix is to resolve `bin/crew` from `import.meta.url` and spawn the bash shim, which handles its own tsx invocation.

```typescript
import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startDaemon } from 'crew-daemon';

// daemon.ts lives at packages/cli/src/commands/daemon.ts; bin/crew is at packages/cli/bin/crew
const __dirname = dirname(fileURLToPath(import.meta.url));
const CREW_BIN = resolve(__dirname, '..', '..', 'bin', 'crew');

const DEFAULT_CONFIG_DIR = process.env.CREW_CONFIG_DIR ?? join(homedir(), '.config', 'crew');
const DEFAULT_PID_FILE = process.env.CREW_PID_FILE ?? join(DEFAULT_CONFIG_DIR, 'daemon.pid');
const DEFAULT_LOG_FILE = process.env.CREW_LOG_FILE ?? join(DEFAULT_CONFIG_DIR, 'daemon.log');
const DEFAULT_PORT = Number(process.env.CREW_PORT ?? 7773);

export function readPid(path: string): number | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8').trim();
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0) {
    unlinkSync(path);
    return null;
  }
  return pid;
}

export function writePid(path: string, pid: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, String(pid), 'utf8');
}

export function removePid(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'; // exists, owned by other user
  }
}

async function runServe(): Promise<void> {
  await startDaemon(process.env);
}

function runStart(): void {
  const pid = readPid(DEFAULT_PID_FILE);
  if (pid && isProcessAlive(pid)) {
    console.log(`crew daemon already running (pid ${pid})`);
    return;
  }
  mkdirSync(dirname(DEFAULT_LOG_FILE), { recursive: true });
  const child = spawn(CREW_BIN, ['daemon', 'serve'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  child.unref();
  if (!child.pid) {
    console.error('failed to spawn daemon');
    process.exitCode = 1;
    return;
  }
  writePid(DEFAULT_PID_FILE, child.pid);
  console.log(`crew daemon started (pid ${child.pid}, port ${DEFAULT_PORT})`);
  console.log(`logs: ${DEFAULT_LOG_FILE}`);
}

function runStop(): void {
  const pid = readPid(DEFAULT_PID_FILE);
  if (!pid) {
    console.log('crew daemon not running');
    return;
  }
  if (!isProcessAlive(pid)) {
    console.log(`crew daemon not running (stale pidfile, pid ${pid}) — cleaning up`);
    removePid(DEFAULT_PID_FILE);
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    console.error(`failed to signal pid ${pid}:`, (err as Error).message);
    process.exitCode = 1;
    return;
  }
  // Brief wait + cleanup. For more aggressive verification, the integration
  // smoke test polls; this command returns once SIGTERM is sent.
  removePid(DEFAULT_PID_FILE);
  console.log(`crew daemon stopped (pid ${pid})`);
}

function runStatus(): void {
  const pid = readPid(DEFAULT_PID_FILE);
  if (!pid) {
    console.log('crew daemon: stopped');
    return;
  }
  if (!isProcessAlive(pid)) {
    console.log(`crew daemon: stale pidfile (pid ${pid}) — cleaning up`);
    removePid(DEFAULT_PID_FILE);
    return;
  }
  console.log(`crew daemon: running (pid ${pid}, port ${DEFAULT_PORT})`);
}

export const daemonCommand = new Command('daemon')
  .description('start, stop, or inspect the crew daemon');

daemonCommand
  .command('serve')
  .description('run the daemon in the foreground (used by `start`)')
  .action(async () => {
    await runServe();
  });

daemonCommand.command('start').description('start the daemon detached').action(runStart);
daemonCommand.command('stop').description('stop the daemon').action(runStop);
daemonCommand.command('status').description('show daemon status').action(runStatus);
```

- [ ] **Step 5: Run unit tests to verify they pass**

```bash
npm run test:run --workspace=crew-cli -- daemon
```

Expected: PASS.

- [ ] **Step 6: Wire the daemon command into the CLI**

Edit `packages/cli/src/index.ts`. Add the import and registration:

```typescript
import { daemonCommand } from './commands/daemon.js';
```

Then after the existing `program.addCommand(...)` calls, add:

```typescript
program.addCommand(daemonCommand);
```

- [ ] **Step 7: Add a gated integration smoke test**

Append to `packages/cli/src/commands/daemon.test.ts`:

```typescript
import { execa } from 'execa';

describe.skipIf(!process.env.CREW_RUN_INTEGRATION)('daemon lifecycle (integration)', () => {
  it('start → status → stop round-trip', async () => {
    const tmpDir = tmp();
    const env = {
      ...process.env,
      CREW_CONFIG_DIR: tmpDir,
      CREW_PORT: '17773',
    };
    const crewBin = 'packages/cli/bin/crew';
    await execa(crewBin, ['daemon', 'start'], { env });
    // Poll for liveness up to 5s
    const pidFile = join(tmpDir, 'daemon.pid');
    let alive = false;
    for (let i = 0; i < 50; i++) {
      const pid = readPid(pidFile);
      if (pid && isProcessAlive(pid)) {
        alive = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(alive).toBe(true);
    const status = await execa(crewBin, ['daemon', 'status'], { env });
    expect(status.stdout).toMatch(/running/);
    await execa(crewBin, ['daemon', 'stop'], { env });
    // Allow SIGTERM to drain
    await new Promise((r) => setTimeout(r, 500));
    expect(readPid(pidFile)).toBeNull();
  }, 15_000);
});
```

- [ ] **Step 8: Run the integration test once locally**

```bash
CREW_RUN_INTEGRATION=1 npm run test:run --workspace=crew-cli -- daemon
```

Expected: PASS, including the gated `daemon lifecycle (integration)` block.

- [ ] **Step 9: Run the default suite (gate skips integration)**

```bash
npm run test:run --workspace=crew-cli -- daemon
```

Expected: unit tests PASS, integration test reported as skipped.

- [ ] **Step 10: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): crew daemon serve|start|stop|status (CREW-XX)"
```

---

## Task 5: Dashboard wiring — `HttpProjectsClient`, `HybridDaemonClient`, Vite proxy

**Files:**
- Create: `packages/dashboard/src/data/HttpProjectsClient.ts`
- Create: `packages/dashboard/src/data/HttpProjectsClient.test.ts`
- Create: `packages/dashboard/src/data/HybridDaemonClient.ts`
- Create: `packages/dashboard/src/data/HybridDaemonClient.test.ts`
- Modify: `packages/dashboard/vite.config.ts`
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/App.test.tsx`

- [ ] **Step 1: Write the failing test for `HttpProjectsClient`**

Create `packages/dashboard/src/data/HttpProjectsClient.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpProjectsClient } from './HttpProjectsClient.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HttpProjectsClient.listProjects', () => {
  it('GETs /api/projects and returns the projects array', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            projects: [{ name: 'demo', repoPath: '/code/demo' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const client = new HttpProjectsClient();
    const projects = await client.listProjects();

    expect(fetchSpy).toHaveBeenCalledWith('/api/projects', expect.objectContaining({ method: 'GET' }));
    expect(projects).toEqual([{ name: 'demo', repoPath: '/code/demo' }]);
  });

  it('throws when the response shape does not match the schema', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ wrong: 'shape' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new HttpProjectsClient();
    await expect(client.listProjects()).rejects.toThrow();
  });

  it('throws on non-2xx status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }));
    const client = new HttpProjectsClient();
    await expect(client.listProjects()).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run --workspace=crew-dashboard -- HttpProjectsClient
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `packages/dashboard/src/data/HttpProjectsClient.ts`**

```typescript
import { z } from 'zod';
import type { Project } from './types.js';

const ProjectsResponseSchema = z.object({
  projects: z.array(
    z.object({
      name: z.string(),
      repoPath: z.string(),
    }),
  ),
});

export class HttpProjectsClient {
  constructor(private readonly baseUrl: string = '') {}

  async listProjects(): Promise<Project[]> {
    const res = await fetch(`${this.baseUrl}/api/projects`, { method: 'GET' });
    if (!res.ok) throw new Error(`GET /api/projects: ${res.status}`);
    const json = (await res.json()) as unknown;
    const parsed = ProjectsResponseSchema.parse(json);
    return parsed.projects;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run --workspace=crew-dashboard -- HttpProjectsClient
```

Expected: PASS for all three cases.

- [ ] **Step 5: Write the failing test for `HybridDaemonClient`**

Create `packages/dashboard/src/data/HybridDaemonClient.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { HybridDaemonClient } from './HybridDaemonClient.js';
import type { Agent, Project } from './types.js';

describe('HybridDaemonClient', () => {
  it('listProjects delegates to the http client', async () => {
    const projects: Project[] = [{ name: 'demo', repoPath: '/x' }];
    const http = { listProjects: vi.fn().mockResolvedValue(projects) };
    const mock = { listAgents: vi.fn() };
    const client = new HybridDaemonClient(http, mock as never);

    expect(await client.listProjects()).toBe(projects);
    expect(http.listProjects).toHaveBeenCalledOnce();
  });

  it('listAgents delegates to the mock client', async () => {
    const agents: Agent[] = [];
    const http = { listProjects: vi.fn() };
    const mock = { listAgents: vi.fn().mockResolvedValue(agents) };
    const client = new HybridDaemonClient(http as never, mock as never);

    expect(await client.listAgents()).toBe(agents);
    expect(mock.listAgents).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npm run test:run --workspace=crew-dashboard -- HybridDaemonClient
```

Expected: FAIL — module does not exist.

- [ ] **Step 7: Implement `packages/dashboard/src/data/HybridDaemonClient.ts`**

```typescript
import type { DaemonClient } from './DaemonClient.js';
import type { Agent, Project } from './types.js';

interface ProjectsSource {
  listProjects(): Promise<Project[]>;
}

interface AgentsSource {
  listAgents(): Promise<Agent[]>;
}

/**
 * Composes a real HTTP client (for projects) with a mock client (for agents).
 * TODO(slice 1b): replace with a single HttpDaemonClient once /api/agents ships.
 */
export class HybridDaemonClient implements DaemonClient {
  constructor(
    private readonly projectsSource: ProjectsSource,
    private readonly agentsSource: AgentsSource,
  ) {}

  listProjects(): Promise<Project[]> {
    return this.projectsSource.listProjects();
  }

  listAgents(): Promise<Agent[]> {
    return this.agentsSource.listAgents();
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npm run test:run --workspace=crew-dashboard -- HybridDaemonClient
```

Expected: PASS.

- [ ] **Step 9: Update `packages/dashboard/src/App.tsx` to use the hybrid client**

Replace lines 12–16 in `App.tsx` with:

```typescript
import type { DaemonClient } from './data/DaemonClient.js';
import { HttpProjectsClient } from './data/HttpProjectsClient.js';
import { HybridDaemonClient } from './data/HybridDaemonClient.js';
import { MockDaemonClient } from './data/MockDaemonClient.js';
import { navigate, useHashRoute } from './routing/useHashRoute.js';

const defaultClient: DaemonClient = new HybridDaemonClient(
  new HttpProjectsClient(),
  new MockDaemonClient(),
);
```

(All other lines unchanged.)

- [ ] **Step 10: Update `packages/dashboard/src/App.test.tsx` to inject a client**

Read the current `App.test.tsx` (existing test). Where it constructs the App with the default client, change it to inject a hybrid that stubs `listProjects` via a fetch mock OR a lightweight test client. The simplest path: in the test's `beforeEach`, mock `globalThis.fetch` to return the projects fixtures, so `HttpProjectsClient` resolves to a known list. The `MockDaemonClient` continues to provide agents.

```typescript
import { vi, beforeEach, afterEach } from 'vitest';
import { FIXTURE_PROJECTS } from './data/fixtures.js';

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ projects: FIXTURE_PROJECTS }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

(Add these blocks at the top of the `describe('App', ...)` block. The existing assertions about which projects render should still pass because the fixture set is identical.)

- [ ] **Step 11: Update `packages/dashboard/vite.config.ts` to proxy `/api`**

Replace the file with:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:7773', changeOrigin: false },
    },
  },
});
```

- [ ] **Step 12: Run the full dashboard test suite**

```bash
npm run test:run --workspace=crew-dashboard
```

Expected: PASS (existing tests + new clients).

- [ ] **Step 13: Manual end-to-end smoke**

In one terminal:

```bash
mkdir -p /tmp/crew-smoke/projects
cat > /tmp/crew-smoke/projects/demo.toml <<'EOF'
name = "demo"
repo_path = "/code/demo"

[jira]
project_key = "DEMO"
site = "https://example.atlassian.net"

[github]
repo = "example/demo"
EOF
CREW_CONFIG_DIR=/tmp/crew-smoke npm run dev --workspace=crew-daemon
```

In another:

```bash
npm run dev --workspace=crew-dashboard
```

Open `http://localhost:5173` in a browser. Verify a `demo` project section renders (with mock agents underneath, since agents are still mock).

Cleanup: stop both processes; `rm -rf /tmp/crew-smoke`.

- [ ] **Step 14: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 15: Commit**

```bash
git add packages/dashboard
git commit -m "feat(dashboard): wire project sections to /api/projects via HybridDaemonClient (CREW-XX)"
```

---

## Task 6: Production static serve (`@fastify/static` + SPA fallback)

**Files:**
- Modify: `packages/daemon/src/app.ts`
- Modify: `packages/daemon/src/app.test.ts`

- [ ] **Step 1: Write the failing test for static serve + SPA fallback**

Append to `packages/daemon/src/app.test.ts`:

```typescript
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('static serving', () => {
  it('serves index.html at / when dist directory exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-daemon-static-'));
    tmpdirs.push(dir);
    const distDir = join(dir, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, 'index.html'), '<!DOCTYPE html><html><body>hi</body></html>');

    const config = parseDaemonConfig({ CREW_CONFIG_DIR: dir });
    const logger = createLogger({ level: 'silent' });
    const db = openDb(config.dbFile);
    const container = buildContainer({ config, logger, db });
    const app = await buildApp({ container, dashboardDistDir: distDir });
    try {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('<body>hi</body>');
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('falls back to index.html for SPA routes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-daemon-spa-'));
    tmpdirs.push(dir);
    const distDir = join(dir, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, 'index.html'), '<!DOCTYPE html><html><body>spa</body></html>');

    const config = parseDaemonConfig({ CREW_CONFIG_DIR: dir });
    const logger = createLogger({ level: 'silent' });
    const db = openDb(config.dbFile);
    const container = buildContainer({ config, logger, db });
    const app = await buildApp({ container, dashboardDistDir: distDir });
    try {
      const res = await app.inject({ method: 'GET', url: '/agents/KAN-31' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('<body>spa</body>');
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('serves a placeholder when dashboardDistDir is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-daemon-placeholder-'));
    tmpdirs.push(dir);
    const config = parseDaemonConfig({ CREW_CONFIG_DIR: dir });
    const logger = createLogger({ level: 'silent' });
    const db = openDb(config.dbFile);
    const container = buildContainer({ config, logger, db });
    const app = await buildApp({ container, dashboardDistDir: '/nonexistent/path' });
    try {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('dashboard not built');
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('does not intercept /api routes with the SPA fallback', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-daemon-api-'));
    tmpdirs.push(dir);
    const distDir = join(dir, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, 'index.html'), '<!DOCTYPE html><html><body>shell</body></html>');

    const config = parseDaemonConfig({ CREW_CONFIG_DIR: dir });
    mkdirSync(join(dir, 'projects'), { recursive: true });
    const logger = createLogger({ level: 'silent' });
    const db = openDb(config.dbFile);
    const container = buildContainer({ config, logger, db });
    const app = await buildApp({ container, dashboardDistDir: distDir });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ projects: [] });
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});
```

(The existing `tmpdirs` array, `mkdtempSync`/`tmpdir`/`join` imports, and `tmp` helper from earlier in the file are reused.)

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run --workspace=crew-daemon -- app.test
```

Expected: FAIL — `dashboardDistDir` option does not exist.

- [ ] **Step 3: Update `buildApp` to accept `dashboardDistDir` and serve static files**

Edit `packages/daemon/src/app.ts`. Update the function signature and add static serving after route registration:

```typescript
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { fastifyAwilixPlugin } from '@fastify/awilix';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AwilixContainer } from 'awilix';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Cradle } from './container.js';
import { ConfigDirNotFoundError, NotFoundError } from './errors.js';
import { registerProjectsRoutes } from './routes/projects.js';

const PLACEHOLDER_HTML = `<!DOCTYPE html>
<html>
  <head><title>crew daemon</title></head>
  <body style="font-family: system-ui; padding: 2rem;">
    <h1>crew daemon</h1>
    <p>dashboard not built — run <code>npm run build --workspace=crew-dashboard</code></p>
  </body>
</html>`;

export async function buildApp(opts: {
  container: AwilixContainer<Cradle>;
  dashboardDistDir?: string;
}): Promise<FastifyInstance> {
  const logger = opts.container.cradle.logger;
  const app = Fastify({ loggerInstance: logger }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifyAwilixPlugin, {
    container: opts.container,
    asyncInit: false,
    asyncDispose: false,
    disposeOnClose: false,
    disposeOnResponse: false,
    strictBooleanEnforced: true,
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
    if (err instanceof ConfigDirNotFoundError)
      return reply.code(500).send({ error: 'config_dir_missing', path: err.path });
    if ('validation' in err && err.validation)
      return reply.code(400).send({ error: 'invalid_input', details: err.validation });
    app.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'internal_error' });
  });

  app.get('/health', async () => ({ ok: true }));
  await registerProjectsRoutes(app);

  const distDir = opts.dashboardDistDir;
  if (distDir && existsSync(join(distDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: distDir, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      // /api/* should 404; everything else falls back to index.html
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.code(200).type('text/html').send(PLACEHOLDER_HTML);
    });
  }

  return app;
}
```

- [ ] **Step 4: Run static-serve tests to verify they pass**

```bash
npm run test:run --workspace=crew-daemon -- app.test
```

Expected: PASS for all four new cases AND the original `/health` and 404 cases.

- [ ] **Step 5: Update `serve.ts` to compute and pass `dashboardDistDir`**

Edit `packages/daemon/src/serve.ts`. Update `startDaemon` to resolve the dashboard dist dir relative to the daemon's package and pass it to `buildApp`:

```typescript
import { parseDaemonConfig } from './config.js';
import { createLogger } from './logger.js';
import { openDb, runMigrations } from './db.js';
import { buildContainer } from './container.js';
import { buildApp } from './app.js';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIST = resolve(__dirname, '..', '..', 'dashboard', 'dist');

export async function startDaemon(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = parseDaemonConfig(env);
  mkdirSync(config.configDir, { recursive: true });
  mkdirSync(dirname(config.dbFile), { recursive: true });

  const logger = createLogger({
    destination: process.stdout.isTTY ? undefined : config.logFile,
  });
  const db = openDb(config.dbFile);
  await runMigrations(db);

  const container = buildContainer({ config, logger, db });
  const app = await buildApp({ container, dashboardDistDir: DASHBOARD_DIST });

  const onShutdown = async () => {
    logger.info('shutting down');
    await app.close();
    await db.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', onShutdown);
  process.on('SIGINT', onShutdown);

  await app.listen({ host: '127.0.0.1', port: config.port });
  logger.info({ port: config.port, dashboardDist: DASHBOARD_DIST }, 'crew daemon listening');
}
```

- [ ] **Step 6: Manual smoke — daemon serves built dashboard**

```bash
npm run build --workspace=crew-dashboard
mkdir -p /tmp/crew-smoke/projects
cat > /tmp/crew-smoke/projects/demo.toml <<'EOF'
name = "demo"
repo_path = "/code/demo"

[jira]
project_key = "DEMO"
site = "https://example.atlassian.net"

[github]
repo = "example/demo"
EOF
CREW_CONFIG_DIR=/tmp/crew-smoke npm run dev --workspace=crew-daemon &
sleep 1
curl -sI http://localhost:7773/
curl -s http://localhost:7773/api/projects
kill %1
rm -rf /tmp/crew-smoke
```

Expected: `200 OK` + `text/html` for `/`; `{"projects":[{"name":"demo","repoPath":"/code/demo"}]}` for `/api/projects`.

- [ ] **Step 7: Run all tests**

```bash
npm run test:run
```

Expected: PASS.

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/daemon
git commit -m "feat(daemon): serve dashboard build at / with SPA fallback (CREW-XX)"
```

---

## Task 7: Architecture-doc supersession note

**Files:**
- Modify: `docs/plans/architecture.md`

- [ ] **Step 1: Update the architecture doc's Phase 2 stack picks**

Open `docs/plans/architecture.md`. Find the line in the Phase 2 → Daemon section that reads:

> Stack: Hono (lightweight web framework), better-sqlite3, chokidar for FS watching.

Replace it with:

> Stack: Fastify + `fastify-type-provider-zod`, Kysely + `kysely-better-sqlite3` (SQLite kept for the personal-tool fit), `@fastify/awilix` for DI, pino for logging, chokidar for FS watching. Aligned with the `reaching-for-backend-patterns` skill — superseded the original Hono / raw-better-sqlite3 picks during the slice 1a brainstorm. See `docs/superpowers/specs/2026-04-28-daemon-bootstrap-and-projects-endpoint-design.md` §1 for rationale.

Also find the `**Phase 2/3 add:**` line near the top of the Tech-stack section:

> **Phase 2/3 add:** chokidar (fs watching), better-sqlite3 (state), hono (daemon HTTP), vite + react (dashboard).

Replace it with:

> **Phase 2/3 add:** chokidar (fs watching), better-sqlite3 + Kysely (state), fastify (daemon HTTP), vite + react (dashboard). Vite + React landed in Phase 3's first slice; Fastify + Kysely scaffolding land in slice 1a of Phase 3 (`docs/superpowers/specs/2026-04-28-daemon-bootstrap-and-projects-endpoint-design.md`).

- [ ] **Step 2: Verify the change by re-reading the modified sections**

```bash
grep -n "Fastify\|Kysely\|reaching-for-backend-patterns" docs/plans/architecture.md
```

Expected: lines containing the new mentions.

- [ ] **Step 3: Commit**

```bash
git add docs/plans/architecture.md
git commit -m "docs: supersede Phase 2 stack — Fastify + Kysely (slice 1a) (CREW-XX)"
```

---

## Final verification

- [ ] **Step 1: Full repo test run**

```bash
npm run test:run
```

Expected: PASS across all workspaces.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: no errors. (Auto-fix with `npm run lint:fix` if any appear.)

- [ ] **Step 3: Format check**

```bash
npm run format:check
```

Expected: no diffs. (Run `npm run format` to fix.)

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors across workspaces.

- [ ] **Step 5: End-to-end manual smoke**

Same as Task 6 Step 6 (build dashboard, start daemon with a tmp config dir, hit `/` and `/api/projects`).
