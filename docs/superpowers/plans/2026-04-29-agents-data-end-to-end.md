# Agents Data End-to-End (Slice 1b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up SQLite-backed agent state in the daemon (schema + chokidar/tail-driven ingest service), expose `GET /api/agents` returning real data, wire `crew run` and `crew fix-pr` to register and complete runs against new daemon endpoints, and replace the dashboard's temporary `HybridDaemonClient` with a single `HttpDaemonClient` that fetches both projects and agents — all polling-based; SSE deferred to slice 1c.

**Architecture:** Per spec `docs/superpowers/specs/2026-04-29-agents-data-end-to-end-design.md`. The CLI registers each run via `POST /api/agents/runs` immediately after spawning claude, then calls `POST .../runs/:runId/complete` when the awaited claude process exits. The daemon attaches a `tailTranscript` (existing helper, moved to `crew-shared`) per active run; assistant-with-tool-use events become `tool_calls` rows. `AgentsService.list()` joins agents → latest run → tool-call aggregates and derives state.

**Tech Stack:** Existing — Fastify 5, `fastify-type-provider-zod`, Zod 4, `@fastify/awilix`, Awilix 12, pino 9, Kysely 0.28, `kysely-better-sqlite3`, `better-sqlite3`, Vitest, React 19 + Vite 8 + TanStack Query. New runtime dependency: `chokidar` 4 (in the daemon, narrow per-session-file usage).

**Inputs to this plan:**

- Spec: `docs/superpowers/specs/2026-04-29-agents-data-end-to-end-design.md`
- Slice 1a spec (predecessor): `docs/superpowers/specs/2026-04-28-daemon-bootstrap-and-projects-endpoint-design.md`
- Backend skill: `~/.claude/skills/reaching-for-backend-patterns`
- Existing transcripts module to be moved: `packages/cli/src/lib/transcripts/{parser,tail,types,index}.ts`
- Existing path helper to be moved: `packages/cli/src/lib/run/paths.ts` (specifically `claudeProjectDirFor`)
- Existing daemon shape (post-1a): `packages/daemon/src/{app,container,db,config,logger,errors,serve,startDaemon}.ts`, `packages/daemon/src/services/ProjectsService.ts`, `packages/daemon/src/routes/projects.ts`
- CLI spawn site: `packages/cli/src/commands/run.ts:190-247` (claude spawn, transcript path resolution, await loop)

**Out of scope (deferred to slice 1c or later):**

- SSE / `GET /events`
- `crew finish` → daemon integration
- `idle` / `waiting` state derivation
- `GET /api/agents/:key` and any drawer/timeline endpoints
- PR URL extraction from JSONL (column stays NULL in this slice)
- Bruno collection covering the new endpoints — handled under the existing daemon-API-collection prereq ticket

---

## File structure overview

Files created, modified, or deleted by this plan:

```
packages/shared/
├── package.json                                 # MOD — add dep on smol-toml already present; nothing new
└── src/
    ├── index.ts                                 # MOD — re-export new modules
    ├── transcripts/
    │   ├── index.ts                             # NEW — moved verbatim from cli
    │   ├── parser.ts                            # NEW — moved verbatim from cli, plus export `summarizeInput`
    │   ├── parser.test.ts                       # NEW — moved verbatim from cli
    │   ├── tail.ts                              # NEW — moved verbatim from cli
    │   ├── tail.test.ts                         # NEW — moved verbatim from cli
    │   └── types.ts                             # NEW — moved verbatim from cli
    └── claude-paths/
        ├── index.ts                             # NEW — barrel
        ├── claudeProjectDirFor.ts               # NEW — moved from cli/lib/run/paths.ts
        └── claudeProjectDirFor.test.ts          # NEW — moved subset of cli/lib/run/paths.test.ts

packages/cli/
├── package.json                                 # (already has crew-shared dep)
└── src/
    ├── lib/
    │   ├── transcripts/                         # DELETE — directory + 6 files; replaced by re-exports through crew-shared
    │   ├── run/
    │   │   ├── index.ts                         # MOD — drop `./paths.js` re-export of claudeProjectDirFor (still re-export the others), or update paths.ts itself
    │   │   ├── paths.ts                         # MOD — remove claudeProjectDirFor (other helpers stay); re-import from crew-shared if needed elsewhere
    │   │   └── paths.test.ts                    # MOD — remove the claudeProjectDirFor block (its replacement lives in shared)
    │   ├── index.ts                             # MOD — `export * from './transcripts/index.js'` is gone (covered by `export * from 'crew-shared'`)
    │   └── daemon-client/
    │       ├── index.ts                         # NEW
    │       └── index.test.ts                    # NEW
    └── commands/
        ├── run.ts                                # MOD — register run after transcript path resolves, complete run after await claudeProcess
        └── fix-pr.ts                             # MOD — same pattern as run.ts

packages/daemon/
├── package.json                                  # MOD — add `chokidar` dep
└── src/
    ├── db.ts                                     # MOD — populate `DaemonDatabase` with new table types
    ├── container.ts                              # MOD — register IngestService, AgentsService
    ├── app.ts                                    # MOD — `await registerAgentsRoutes(app)` + `await registerRunsRoutes(app)`; start IngestService on ready, stop on close
    ├── migrations/
    │   └── 0001_agents_runs_tool_calls.ts        # NEW
    ├── services/
    │   ├── IngestService.ts                      # NEW
    │   ├── IngestService.test.ts                 # NEW
    │   ├── AgentsService.ts                      # NEW
    │   └── AgentsService.test.ts                 # NEW
    └── routes/
        ├── agents.ts                              # NEW — GET /api/agents
        ├── agents.test.ts                         # NEW
        ├── runs.ts                                # NEW — POST /api/agents/runs + POST .../runs/:runId/complete
        └── runs.test.ts                           # NEW

packages/dashboard/
├── src/
│   ├── App.tsx                                   # MOD — defaultClient = new HttpDaemonClient(); add refetchInterval: 2000
│   ├── App.test.tsx                              # MOD — inject MockDaemonClient (Hybrid is gone)
│   └── data/
│       ├── HttpDaemonClient.ts                   # NEW — implements both methods
│       ├── HttpDaemonClient.test.ts              # NEW
│       ├── HttpProjectsClient.ts                 # DELETE
│       ├── HttpProjectsClient.test.ts            # DELETE
│       ├── HybridDaemonClient.ts                 # DELETE
│       └── HybridDaemonClient.test.ts            # DELETE
```

Each task below produces a self-contained, committable change.

---

## Task 1: Move `transcripts/` and `claudeProjectDirFor` to `crew-shared`

**Files:**
- Create: `packages/shared/src/transcripts/{index,parser,parser.test,tail,tail.test,types}.ts`
- Create: `packages/shared/src/claude-paths/{index,claudeProjectDirFor,claudeProjectDirFor.test}.ts`
- Modify: `packages/shared/src/index.ts`
- Delete: `packages/cli/src/lib/transcripts/` (whole directory)
- Modify: `packages/cli/src/lib/run/paths.ts`
- Modify: `packages/cli/src/lib/run/paths.test.ts`
- Modify: `packages/cli/src/lib/index.ts`
- Modify: `packages/cli/src/commands/run.ts` (import path update)

- [ ] **Step 1: Copy `cli/src/lib/transcripts/*` to `shared/src/transcripts/*`**

```bash
mkdir -p packages/shared/src/transcripts
cp packages/cli/src/lib/transcripts/index.ts packages/shared/src/transcripts/index.ts
cp packages/cli/src/lib/transcripts/parser.ts packages/shared/src/transcripts/parser.ts
cp packages/cli/src/lib/transcripts/parser.test.ts packages/shared/src/transcripts/parser.test.ts
cp packages/cli/src/lib/transcripts/tail.ts packages/shared/src/transcripts/tail.ts
cp packages/cli/src/lib/transcripts/tail.test.ts packages/shared/src/transcripts/tail.test.ts
cp packages/cli/src/lib/transcripts/types.ts packages/shared/src/transcripts/types.ts
```

- [ ] **Step 2: Export `summarizeInput` from the moved `parser.ts`**

`summarizeInput` is currently a private helper inside `parser.ts`. The daemon's `IngestService` (Task 3) needs it to compute `input_summary`. Edit `packages/shared/src/transcripts/parser.ts` and change the line:

```typescript
function summarizeInput(toolName: string, input: Record<string, unknown>): string {
```

to:

```typescript
export function summarizeInput(toolName: string, input: Record<string, unknown>): string {
```

(All other lines unchanged.)

- [ ] **Step 3: Move `claudeProjectDirFor` to `shared/`**

The function lives at `packages/cli/src/lib/run/paths.ts:20`. Read the file, find the function declaration plus its imports, copy them into a new file `packages/shared/src/claude-paths/claudeProjectDirFor.ts`:

```typescript
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Resolve the directory under `~/.claude/projects/` that Claude Code
 * writes session JSONLs into for the given worktree. Claude slugifies
 * the worktree's absolute path by replacing each `/` with `-`.
 */
export function claudeProjectDirFor(worktreePath: string, home: string = homedir()): string {
  const slug = worktreePath.replace(/\//g, '-');
  return join(home, '.claude', 'projects', slug);
}
```

Then create `packages/shared/src/claude-paths/index.ts`:

```typescript
export * from './claudeProjectDirFor.js';
```

- [ ] **Step 4: Move the `claudeProjectDirFor` test cases**

Read `packages/cli/src/lib/run/paths.test.ts`. Identify the `describe('claudeProjectDirFor', ...)` block. Copy that block (and its imports as needed) into a new file `packages/shared/src/claude-paths/claudeProjectDirFor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { claudeProjectDirFor } from './claudeProjectDirFor.js';

describe('claudeProjectDirFor', () => {
  it('slugifies worktree paths under ~/.claude/projects/', () => {
    expect(claudeProjectDirFor('/home/me/Repos/Recipes-App-KAN-23', '/home/me')).toBe(
      '/home/me/.claude/projects/-home-me-Repos-Recipes-App-KAN-23',
    );
  });

  it('handles bare paths', () => {
    expect(claudeProjectDirFor('/x/y', '/var/u')).toBe('/var/u/.claude/projects/-x-y');
  });
});
```

(Copy any additional cases verbatim from the original block.)

- [ ] **Step 5: Add re-exports to `packages/shared/src/index.ts`**

Replace the file with:

```typescript
export * from './config/index.js';
export * from './transcripts/index.js';
export * from './claude-paths/index.js';
```

- [ ] **Step 6: Run shared tests to verify the moved tests pass**

```bash
npm run test:run --workspace=crew-shared
```

Expected: all tests pass (config + transcripts + claude-paths).

- [ ] **Step 7: Delete the old CLI transcripts directory**

```bash
rm -rf packages/cli/src/lib/transcripts
```

- [ ] **Step 8: Remove `claudeProjectDirFor` from `cli/lib/run/paths.ts`**

Edit `packages/cli/src/lib/run/paths.ts`. Delete the `claudeProjectDirFor` function declaration (lines containing it and its JSDoc, if any). Remove the now-unused `homedir` and `join` imports if `claudeProjectDirFor` was their only consumer (verify by re-reading the file after the deletion).

- [ ] **Step 9: Remove the `claudeProjectDirFor` block from `cli/lib/run/paths.test.ts`**

Edit `packages/cli/src/lib/run/paths.test.ts`. Delete the `describe('claudeProjectDirFor', ...)` block (the test now lives in `shared/`). Remove `claudeProjectDirFor` from the import line at the top (other helpers stay).

- [ ] **Step 10: Update `cli/src/lib/index.ts`**

Edit `packages/cli/src/lib/index.ts`. Remove the `export * from './transcripts/index.js';` line (the directory is gone). The `crew-shared` re-export already covers it via `cli/src/lib/index.ts`'s existing `export * from 'crew-shared';` line — verify that line is present; if not, add it.

- [ ] **Step 11: Find and update CLI imports of the moved symbols**

```bash
grep -rn "from.*lib/transcripts" packages/cli/src/
grep -rn "claudeProjectDirFor" packages/cli/src/
```

Update each match: imports of transcript symbols (`tailTranscript`, `parseToolCall`, `formatToolCall`, `parseTranscript`, `aggregateUsage`, `TranscriptEvent`, etc.) and `claudeProjectDirFor` should come from `crew-shared` directly (or from `'../lib/index.js'` which re-exports from `crew-shared`). The simplest update: replace any `from '../lib/transcripts/index.js'` with `from '../lib/index.js'`. Similarly for `claudeProjectDirFor` if it's imported via `'../lib/run/index.js'` or `'../lib/run/paths.js'` — switch to `'../lib/index.js'`.

- [ ] **Step 12: Run the full suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 13: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 14: Commit**

```bash
git add packages/shared packages/cli
git commit -m "refactor: move transcripts + claudeProjectDirFor to crew-shared (CREW-XX)"
```

---

## Task 2: First migration — `agents`, `runs`, `tool_calls`

**Files:**
- Create: `packages/daemon/src/migrations/0001_agents_runs_tool_calls.ts`
- Create: `packages/daemon/src/migrations/0001_agents_runs_tool_calls.test.ts`
- Modify: `packages/daemon/src/db.ts`

- [ ] **Step 1: Write the failing migration test**

Create `packages/daemon/src/migrations/0001_agents_runs_tool_calls.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, runMigrations } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

describe('0001_agents_runs_tool_calls migration', () => {
  it('creates agents, runs, tool_calls tables with the expected columns', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-migrate-'));
    try {
      const db = createDb(join(dir, 'state.db'));
      try {
        const results = await runMigrations(db, MIGRATIONS_DIR);
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[results.length - 1]?.status).toBe('Success');

        const tables = await db.executeQuery({
          sql: `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('agents','runs','tool_calls') ORDER BY name`,
          parameters: [],
          query: { kind: 'RawNode' },
        } as never);
        expect(tables.rows.map((r: { name: string }) => r.name)).toEqual([
          'agents',
          'runs',
          'tool_calls',
        ]);

        const runsIndexes = await db.executeQuery({
          sql: `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='runs' ORDER BY name`,
          parameters: [],
          query: { kind: 'RawNode' },
        } as never);
        const runsIdxNames = runsIndexes.rows.map((r: { name: string }) => r.name);
        expect(runsIdxNames).toContain('idx_runs_agent_key');
        // session_id UNIQUE constraint creates an auto-named index
        expect(runsIdxNames.some((n: string) => n.includes('autoindex'))).toBe(true);

        const toolCallsIndexes = await db.executeQuery({
          sql: `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tool_calls' ORDER BY name`,
          parameters: [],
          query: { kind: 'RawNode' },
        } as never);
        expect(toolCallsIndexes.rows.map((r: { name: string }) => r.name)).toContain(
          'idx_tool_calls_run_id',
        );
        expect(toolCallsIndexes.rows.map((r: { name: string }) => r.name)).toContain(
          'uniq_tool_calls_run_event',
        );
      } finally {
        await db.destroy();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run --workspace=crew-daemon -- migrations
```

Expected: FAIL — no migration file exists.

- [ ] **Step 3: Implement the migration**

Create `packages/daemon/src/migrations/0001_agents_runs_tool_calls.ts`:

```typescript
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('agents')
    .addColumn('key', 'text', (col) => col.primaryKey())
    .addColumn('project_name', 'text', (col) => col.notNull())
    .addColumn('ticket_title', 'text')
    .addColumn('worktree_path', 'text', (col) => col.notNull())
    .addColumn('branch', 'text')
    .addColumn('pr_url', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('runs')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('agent_key', 'text', (col) => col.notNull().references('agents.key'))
    .addColumn('command', 'text', (col) =>
      col.notNull().check(sql`command IN ('run','fix-pr','finish')`),
    )
    .addColumn('session_id', 'text', (col) => col.notNull().unique())
    .addColumn('started_at', 'text', (col) => col.notNull())
    .addColumn('completed_at', 'text')
    .addColumn('exit_code', 'integer')
    .execute();

  await db.schema.createIndex('idx_runs_agent_key').on('runs').column('agent_key').execute();

  await db.schema
    .createTable('tool_calls')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('run_id', 'integer', (col) => col.notNull().references('runs.id'))
    .addColumn('tool_name', 'text', (col) => col.notNull())
    .addColumn('input_summary', 'text')
    .addColumn('output_tokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('input_tokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('cache_read_tokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('cache_creation_tokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('occurred_at', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_tool_calls_run_id')
    .on('tool_calls')
    .column('run_id')
    .execute();

  // Idempotency for daemon-restart recovery: the same (run, occurred_at,
  // tool_name) tuple should never be ingested twice. INSERT OR IGNORE in
  // IngestService relies on this index.
  await db.schema
    .createIndex('uniq_tool_calls_run_event')
    .unique()
    .on('tool_calls')
    .columns(['run_id', 'occurred_at', 'tool_name'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('tool_calls').execute();
  await db.schema.dropTable('runs').execute();
  await db.schema.dropTable('agents').execute();
}
```

- [ ] **Step 4: Update `DaemonDatabase` type to include the new tables**

Edit `packages/daemon/src/db.ts`. Replace the `DaemonDatabase` type definition with:

```typescript
import type { Generated } from 'kysely';

export interface AgentsTable {
  key: string;
  project_name: string;
  ticket_title: string | null;
  worktree_path: string;
  branch: string | null;
  pr_url: string | null;
  created_at: string;
}

export interface RunsTable {
  id: Generated<number>;
  agent_key: string;
  command: 'run' | 'fix-pr' | 'finish';
  session_id: string;
  started_at: string;
  completed_at: string | null;
  exit_code: number | null;
}

export interface ToolCallsTable {
  id: Generated<number>;
  run_id: number;
  tool_name: string;
  input_summary: string | null;
  output_tokens: number;
  input_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  occurred_at: string;
}

export interface DaemonDatabase {
  agents: AgentsTable;
  runs: RunsTable;
  tool_calls: ToolCallsTable;
}
```

(Keep the existing `createDb` and `runMigrations` exports unchanged.)

- [ ] **Step 5: Run migration test to verify it passes**

```bash
npm run test:run --workspace=crew-daemon -- migrations
```

Expected: PASS.

- [ ] **Step 6: Run all daemon tests + typecheck**

```bash
npm run test:run --workspace=crew-daemon && npm run typecheck --workspace=crew-daemon
```

Expected: all PASS, no type errors. (The existing `app.test.ts` and `db.test.ts` should be unaffected — they don't query the new tables.)

- [ ] **Step 7: Commit**

```bash
git add packages/daemon
git commit -m "feat(daemon): first migration — agents, runs, tool_calls (CREW-XX)"
```

---

## Task 3: `IngestService` — chokidar/tail-driven JSONL ingest

**Files:**
- Modify: `packages/daemon/package.json` (add `chokidar`)
- Create: `packages/daemon/src/services/IngestService.ts`
- Create: `packages/daemon/src/services/IngestService.test.ts`

- [ ] **Step 1: Add `chokidar` to the daemon's dependencies**

Edit `packages/daemon/package.json`. In `dependencies`, add:

```json
"chokidar": "^4.0.3",
```

Then from the repo root:

```bash
npm install
```

- [ ] **Step 2: Write the failing test for `IngestService.ingestEvent`**

Create `packages/daemon/src/services/IngestService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createDb, type DaemonDatabase } from '../db.js';
import { runMigrations } from '../db.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import { IngestService } from './IngestService.js';
import { createLogger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const silentLogger = createLogger({ level: 'silent' });

async function setup(): Promise<{
  db: Kysely<DaemonDatabase>;
  configDir: string;
  worktree: string;
  agentKey: string;
  runId: number;
  sessionId: string;
  jsonlPath: string;
}> {
  const configDir = mkdtempSync(join(tmpdir(), 'crew-ingest-config-'));
  tmpdirs.push(configDir);
  const homeDir = mkdtempSync(join(tmpdir(), 'crew-ingest-home-'));
  tmpdirs.push(homeDir);

  const db = createDb(join(configDir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);

  const worktree = join(homeDir, 'Repos', 'Demo-KAN-1');
  const agentKey = 'KAN-1';
  const sessionId = 'session-abc';
  const slug = worktree.replace(/\//g, '-');
  const projectsRoot = join(homeDir, '.claude', 'projects', slug);
  const jsonlPath = join(projectsRoot, `${sessionId}.jsonl`);

  await db
    .insertInto('agents')
    .values({
      key: agentKey,
      project_name: 'demo',
      ticket_title: 'Demo ticket',
      worktree_path: worktree,
      branch: 'KAN-1',
      pr_url: null,
      created_at: new Date().toISOString(),
    })
    .execute();
  const insertedRun = await db
    .insertInto('runs')
    .values({
      agent_key: agentKey,
      command: 'run',
      session_id: sessionId,
      started_at: new Date().toISOString(),
      completed_at: null,
      exit_code: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return { db, configDir, worktree, agentKey, runId: insertedRun.id, sessionId, jsonlPath };
}

describe('IngestService.ingestEvent', () => {
  it('inserts a tool_calls row for an assistant message with a tool_use block', async () => {
    const { db } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger });
      await svc.ingestEvent(1, {
        type: 'assistant',
        timestamp: '2026-04-29T12:00:00Z',
        message: {
          id: 'm1',
          model: 'claude-opus-4-7',
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls -la' } }],
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 50,
            cache_read_input_tokens: 25,
            output_tokens: 75,
          },
        },
      });
      const rows = await db.selectFrom('tool_calls').selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        run_id: 1,
        tool_name: 'Bash',
        output_tokens: 75,
        input_tokens: 100,
        cache_read_tokens: 25,
        cache_creation_tokens: 50,
        occurred_at: '2026-04-29T12:00:00Z',
      });
      expect(rows[0]?.input_summary).toContain('ls -la');
    } finally {
      await db.destroy();
    }
  });

  it('skips assistant messages without a tool_use block', async () => {
    const { db } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger });
      await svc.ingestEvent(1, {
        type: 'assistant',
        timestamp: '2026-04-29T12:00:00Z',
        message: {
          id: 'm2',
          model: 'claude-opus-4-7',
          role: 'assistant',
          content: [{ type: 'text' } as never],
          usage: {
            input_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
          },
        },
      });
      expect(await db.selectFrom('tool_calls').selectAll().execute()).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });

  it('skips non-assistant event types', async () => {
    const { db } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger });
      await svc.ingestEvent(1, {
        type: 'user',
        timestamp: '2026-04-29T12:00:00Z',
        message: { role: 'user', content: [] },
      });
      expect(await db.selectFrom('tool_calls').selectAll().execute()).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });

  it('idempotently swallows duplicate events (same run_id + occurred_at + tool_name)', async () => {
    const { db } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger });
      const event = {
        type: 'assistant' as const,
        timestamp: '2026-04-29T12:00:00Z',
        message: {
          id: 'm1',
          model: 'claude-opus-4-7',
          role: 'assistant' as const,
          content: [
            { type: 'tool_use' as const, id: 't1', name: 'Bash', input: { command: 'ls' } },
          ],
          usage: {
            input_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
          },
        },
      };
      await svc.ingestEvent(1, event);
      await svc.ingestEvent(1, event); // duplicate
      const rows = await db.selectFrom('tool_calls').selectAll().execute();
      expect(rows).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });
});

describe('IngestService.attach + detach', () => {
  it('tails a JSONL file and ingests events written after attach', async () => {
    const { db, runId, sessionId, worktree } = await setup();
    try {
      const svc = new IngestService({ db, logger: silentLogger });
      const homeDir = process.env.HOME!;
      // Use a custom claudeProjectDirFor by overriding the worktree path slugging — for the test
      // we just write to a path we control and pass it via attach's optional `jsonlPath` override.
      const customDir = mkdtempSync(join(tmpdir(), 'crew-ingest-jsonl-'));
      tmpdirs.push(customDir);
      const jsonlPath = join(customDir, `${sessionId}.jsonl`);
      writeFileSync(jsonlPath, ''); // touch the file so chokidar sees it

      svc.attach({ runId, jsonlPath });

      const event = (idx: number) =>
        JSON.stringify({
          type: 'assistant',
          timestamp: `2026-04-29T12:00:0${idx}Z`,
          message: {
            id: `m${idx}`,
            model: 'claude-opus-4-7',
            role: 'assistant',
            content: [
              { type: 'tool_use', id: `t${idx}`, name: 'Read', input: { file_path: `/x/${idx}` } },
            ],
            usage: {
              input_tokens: 0,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
              output_tokens: 1,
            },
          },
        }) + '\n';

      appendFileSync(jsonlPath, event(1));
      appendFileSync(jsonlPath, event(2));
      // Wait long enough for the 200ms tail poll + a margin
      await delay(800);
      const rowsAfterTwo = await db.selectFrom('tool_calls').selectAll().execute();
      expect(rowsAfterTwo).toHaveLength(2);

      svc.detach(runId);
      // Tail's contract guarantees one final drain pass after abort; allow a beat for it.
      await delay(400);
      appendFileSync(jsonlPath, event(3));
      await delay(800);
      const rowsAfterDetach = await db.selectFrom('tool_calls').selectAll().execute();
      expect(rowsAfterDetach).toHaveLength(2); // event(3) NOT ingested
    } finally {
      await db.destroy();
    }
  }, 10_000);
});

describe('IngestService.start (recovery)', () => {
  it('attaches tails to all open runs at start', async () => {
    const { db, runId, sessionId } = await setup();
    try {
      const customDir = mkdtempSync(join(tmpdir(), 'crew-ingest-recover-'));
      tmpdirs.push(customDir);
      const jsonlPath = join(customDir, `${sessionId}.jsonl`);
      writeFileSync(jsonlPath, '');

      const svc = new IngestService({ db, logger: silentLogger });
      // Spy on attach to verify it's called for the open run
      const attachSpy = vi.spyOn(svc, 'attach');
      // start() reads runs WHERE completed_at IS NULL; we need it to find the path.
      // The spec says IngestService computes path = claudeProjectDirFor(worktree)/sessionId.jsonl.
      // For the test we override the path via an injected resolver.
      await svc.start({ resolveJsonlPath: () => jsonlPath });
      expect(attachSpy).toHaveBeenCalledWith(expect.objectContaining({ runId, jsonlPath }));
      await svc.stop();
    } finally {
      await db.destroy();
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm run test:run --workspace=crew-daemon -- IngestService
```

Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement `packages/daemon/src/services/IngestService.ts`**

```typescript
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import { tailTranscript, parseToolCall, summarizeInput, type TranscriptEvent, claudeProjectDirFor } from 'crew-shared';
import { join } from 'node:path';
import type { DaemonDatabase } from '../db.js';

export interface IngestServiceDeps {
  db: Kysely<DaemonDatabase>;
  logger: Logger;
}

export interface AttachInput {
  runId: number;
  /** When provided, used directly. Otherwise computed via worktreePath + sessionId. */
  jsonlPath?: string;
  worktreePath?: string;
  sessionId?: string;
}

export interface StartOptions {
  /** Test seam for resolving JSONL paths without depending on real filesystem layout. */
  resolveJsonlPath?: (input: { worktreePath: string; sessionId: string }) => string;
}

/**
 * Ingests transcript events for active runs. One tail per run, keyed on
 * runId. `attach` starts a background tail; `detach` aborts it (the tail
 * contract guarantees one final drain pass before the iterator returns).
 *
 * Per slice 1b spec:
 * - Only assistant-with-tool-use events become tool_calls rows.
 * - Idempotent on (run_id, occurred_at, tool_name) via INSERT OR IGNORE
 *   plus the migration's UNIQUE index.
 * - PR URL extraction is deferred to slice 1c — pr_url stays NULL here.
 */
export class IngestService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly logger: Logger;
  private readonly tails = new Map<number, AbortController>();

  constructor(deps: IngestServiceDeps) {
    this.db = deps.db;
    this.logger = deps.logger;
  }

  async start(opts: StartOptions = {}): Promise<void> {
    const open = await this.db
      .selectFrom('runs')
      .innerJoin('agents', 'agents.key', 'runs.agent_key')
      .select(['runs.id as runId', 'runs.session_id as sessionId', 'agents.worktree_path as worktreePath'])
      .where('runs.completed_at', 'is', null)
      .execute();
    for (const row of open) {
      const jsonlPath =
        opts.resolveJsonlPath?.({ worktreePath: row.worktreePath, sessionId: row.sessionId }) ??
        join(claudeProjectDirFor(row.worktreePath), `${row.sessionId}.jsonl`);
      this.attach({ runId: row.runId, jsonlPath });
    }
  }

  attach(input: AttachInput): void {
    if (this.tails.has(input.runId)) return; // already attached
    const jsonlPath =
      input.jsonlPath ??
      (input.worktreePath && input.sessionId
        ? join(claudeProjectDirFor(input.worktreePath), `${input.sessionId}.jsonl`)
        : (() => {
            throw new Error('IngestService.attach requires either jsonlPath or both worktreePath and sessionId');
          })());

    const controller = new AbortController();
    this.tails.set(input.runId, controller);

    void this.runTail(input.runId, jsonlPath, controller.signal).catch((err: unknown) => {
      this.logger.warn({ err, runId: input.runId, jsonlPath }, 'ingest tail crashed');
    });
  }

  detach(runId: number): void {
    const controller = this.tails.get(runId);
    if (!controller) return;
    controller.abort();
    this.tails.delete(runId);
  }

  async stop(): Promise<void> {
    for (const [, controller] of this.tails) controller.abort();
    this.tails.clear();
  }

  async ingestEvent(runId: number, event: TranscriptEvent): Promise<void> {
    if (event.type !== 'assistant') return;
    const call = parseToolCall(event);
    if (!call) return;
    const summary = summarizeInput(call.name, call.input);
    const usage = event.message.usage;
    await this.db
      .insertInto('tool_calls')
      .values({
        run_id: runId,
        tool_name: call.name,
        input_summary: summary,
        output_tokens: usage.output_tokens,
        input_tokens: usage.input_tokens,
        cache_read_tokens: usage.cache_read_input_tokens,
        cache_creation_tokens: usage.cache_creation_input_tokens,
        occurred_at: call.timestamp,
      })
      .onConflict((oc) => oc.columns(['run_id', 'occurred_at', 'tool_name']).doNothing())
      .execute();
  }

  private async runTail(runId: number, path: string, signal: AbortSignal): Promise<void> {
    for await (const event of tailTranscript(path, { signal })) {
      try {
        await this.ingestEvent(runId, event);
      } catch (err) {
        this.logger.warn({ err, runId, path }, 'ingestEvent failed');
      }
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run test:run --workspace=crew-daemon -- IngestService
```

Expected: PASS for all four describe blocks.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck --workspace=crew-daemon
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/daemon
git commit -m "feat(daemon): IngestService — chokidar-tail JSONL ingest with idempotent writes (CREW-XX)"
```

---

## Task 4: `AgentsService.list` + `GET /api/agents`

**Files:**
- Create: `packages/daemon/src/services/AgentsService.ts`
- Create: `packages/daemon/src/services/AgentsService.test.ts`
- Create: `packages/daemon/src/routes/agents.ts`
- Create: `packages/daemon/src/routes/agents.test.ts`
- Modify: `packages/daemon/src/container.ts`
- Modify: `packages/daemon/src/app.ts`

- [ ] **Step 1: Write the failing test for `AgentsService.list`**

Create `packages/daemon/src/services/AgentsService.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import type { Kysely } from 'kysely';
import { AgentsService } from './AgentsService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function freshDb(): Promise<Kysely<DaemonDatabase>> {
  const dir = mkdtempSync(join(tmpdir(), 'crew-agents-svc-'));
  tmpdirs.push(dir);
  const db = createDb(join(dir, 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

async function makeAgent(
  db: Kysely<DaemonDatabase>,
  key: string,
  overrides: Partial<{
    projectName: string;
    ticketTitle: string | null;
    worktreePath: string;
    branch: string;
    prUrl: string | null;
  }> = {},
): Promise<void> {
  await db
    .insertInto('agents')
    .values({
      key,
      project_name: overrides.projectName ?? 'demo',
      ticket_title: overrides.ticketTitle ?? `${key} title`,
      worktree_path: overrides.worktreePath ?? `/x/${key}`,
      branch: overrides.branch ?? key,
      pr_url: overrides.prUrl ?? null,
      created_at: '2026-04-29T12:00:00Z',
    })
    .execute();
}

async function makeRun(
  db: Kysely<DaemonDatabase>,
  agentKey: string,
  sessionId: string,
  opts: { command?: 'run' | 'fix-pr' | 'finish'; completedAt?: string | null; exitCode?: number | null } = {},
): Promise<number> {
  const row = await db
    .insertInto('runs')
    .values({
      agent_key: agentKey,
      command: opts.command ?? 'run',
      session_id: sessionId,
      started_at: '2026-04-29T12:00:00Z',
      completed_at: opts.completedAt ?? null,
      exit_code: opts.exitCode ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

async function makeToolCall(
  db: Kysely<DaemonDatabase>,
  runId: number,
  opts: { tool?: string; summary?: string; tokens?: number; occurredAt?: string } = {},
): Promise<void> {
  await db
    .insertInto('tool_calls')
    .values({
      run_id: runId,
      tool_name: opts.tool ?? 'Read',
      input_summary: opts.summary ?? '/x',
      output_tokens: opts.tokens ?? 10,
      input_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      occurred_at: opts.occurredAt ?? '2026-04-29T12:00:01Z',
    })
    .execute();
}

describe('AgentsService.list', () => {
  it('returns initializing for an agent whose latest run has zero tool_calls', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-1');
      await makeRun(db, 'KAN-1', 's1');
      const svc = new AgentsService({ db });
      const agents = await svc.list();
      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({
        key: 'KAN-1',
        projectName: 'demo',
        ticketTitle: 'KAN-1 title',
        state: 'initializing',
        tokens: 0,
      });
    } finally {
      await db.destroy();
    }
  });

  it('returns running for an agent whose latest run is open and has tool_calls', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-2');
      const runId = await makeRun(db, 'KAN-2', 's2');
      await makeToolCall(db, runId, { tokens: 5 });
      const svc = new AgentsService({ db });
      const agents = await svc.list();
      expect(agents[0]).toMatchObject({ key: 'KAN-2', state: 'running', tokens: 5 });
    } finally {
      await db.destroy();
    }
  });

  it('returns pr_open when latest run is completed=0 AND any tool_call matches gh pr create', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-3');
      const runId = await makeRun(db, 'KAN-3', 's3', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, runId, {
        tool: 'Bash',
        summary: 'gh pr create --title hello',
        tokens: 1,
      });
      const svc = new AgentsService({ db });
      expect((await svc.list())[0]).toMatchObject({ key: 'KAN-3', state: 'pr_open' });
    } finally {
      await db.destroy();
    }
  });

  it('returns finished when latest run is completed=0 AND no gh pr create ever observed', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-4');
      const runId = await makeRun(db, 'KAN-4', 's4', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      await makeToolCall(db, runId, { tool: 'Read', tokens: 2 });
      const svc = new AgentsService({ db });
      expect((await svc.list())[0]).toMatchObject({ key: 'KAN-4', state: 'finished' });
    } finally {
      await db.destroy();
    }
  });

  it('returns error when latest run completed with a non-zero exit code', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-5');
      const runId = await makeRun(db, 'KAN-5', 's5', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 1,
      });
      await makeToolCall(db, runId, { tokens: 3 });
      expect((await new AgentsService({ db }).list())[0]).toMatchObject({
        key: 'KAN-5',
        state: 'error',
      });
    } finally {
      await db.destroy();
    }
  });

  it('aggregates tokens across all runs of the same agent', async () => {
    const db = await freshDb();
    try {
      await makeAgent(db, 'KAN-6');
      const r1 = await makeRun(db, 'KAN-6', 's6a', {
        completedAt: '2026-04-29T13:00:00Z',
        exitCode: 0,
      });
      const r2 = await makeRun(db, 'KAN-6', 's6b', { command: 'fix-pr' });
      await makeToolCall(db, r1, { tokens: 100, occurredAt: '2026-04-29T13:00:01Z' });
      await makeToolCall(db, r2, { tokens: 200, occurredAt: '2026-04-29T14:00:01Z' });
      const agents = await new AgentsService({ db }).list();
      expect(agents[0]).toMatchObject({ key: 'KAN-6', tokens: 300, state: 'running' });
    } finally {
      await db.destroy();
    }
  });

  it('returns an empty list when no agents exist', async () => {
    const db = await freshDb();
    try {
      expect(await new AgentsService({ db }).list()).toEqual([]);
    } finally {
      await db.destroy();
    }
  });
});
```

- [ ] **Step 2: Run service test to verify it fails**

```bash
npm run test:run --workspace=crew-daemon -- AgentsService
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `packages/daemon/src/services/AgentsService.ts`**

```typescript
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { DaemonDatabase } from '../db.js';

export type AgentState = 'initializing' | 'running' | 'pr_open' | 'error' | 'finished';

export interface AgentSummary {
  key: string;
  projectName: string;
  ticketTitle: string;
  state: AgentState;
  startedAt: string;
  tokens: number;
  prUrl?: string;
}

export interface AgentsServiceDeps {
  db: Kysely<DaemonDatabase>;
}

export class AgentsService {
  private readonly db: Kysely<DaemonDatabase>;

  constructor(deps: AgentsServiceDeps) {
    this.db = deps.db;
  }

  async list(): Promise<AgentSummary[]> {
    // One row per agent, with the latest run's lifecycle fields and aggregated
    // totals across all of the agent's runs. SQLite-flavoured Kysely; we use
    // `sql` for the correlated subquery selecting "latest run per agent".
    const rows = await this.db
      .selectFrom('agents as a')
      .leftJoin(
        this.db
          .selectFrom('runs as r')
          .selectAll()
          .where(
            'r.id',
            '=',
            sql<number>`(SELECT id FROM runs r2 WHERE r2.agent_key = r.agent_key ORDER BY r2.id DESC LIMIT 1)`,
          )
          .as('latest'),
        (join) => join.onRef('latest.agent_key', '=', 'a.key'),
      )
      .leftJoin(
        this.db
          .selectFrom('tool_calls as tc')
          .innerJoin('runs as r', 'r.id', 'tc.run_id')
          .select([
            'r.agent_key as agent_key',
            sql<number>`COALESCE(SUM(tc.output_tokens), 0) + COALESCE(SUM(tc.input_tokens), 0) + COALESCE(SUM(tc.cache_read_tokens), 0) + COALESCE(SUM(tc.cache_creation_tokens), 0)`.as(
              'tokens',
            ),
            sql<number>`MAX(CASE WHEN tc.tool_name = 'Bash' AND tc.input_summary LIKE 'gh pr create%' THEN 1 ELSE 0 END)`.as(
              'has_pr_create',
            ),
            sql<number>`MAX(CASE WHEN tc.run_id = (SELECT id FROM runs r3 WHERE r3.agent_key = r.agent_key ORDER BY r3.id DESC LIMIT 1) THEN 1 ELSE 0 END)`.as(
              'latest_has_tool_calls',
            ),
          ])
          .groupBy('r.agent_key')
          .as('totals'),
        (join) => join.onRef('totals.agent_key', '=', 'a.key'),
      )
      .select([
        'a.key',
        'a.project_name as projectName',
        'a.ticket_title as ticketTitle',
        'a.pr_url as prUrl',
        'latest.started_at as startedAt',
        'latest.completed_at as completedAt',
        'latest.exit_code as exitCode',
        'totals.tokens',
        'totals.has_pr_create',
        'totals.latest_has_tool_calls',
      ])
      .orderBy('a.key', 'asc')
      .execute();

    return rows.map((row) => {
      const tokens = row.tokens ?? 0;
      const state = deriveState({
        completedAt: row.completedAt,
        exitCode: row.exitCode,
        latestHasToolCalls: Boolean(row.latest_has_tool_calls),
        hasPrCreate: Boolean(row.has_pr_create),
      });
      const summary: AgentSummary = {
        key: row.key,
        projectName: row.projectName,
        ticketTitle: row.ticketTitle ?? '',
        state,
        startedAt: row.startedAt ?? '',
        tokens,
      };
      if (row.prUrl) summary.prUrl = row.prUrl;
      return summary;
    });
  }
}

interface DeriveStateInput {
  completedAt: string | null;
  exitCode: number | null;
  latestHasToolCalls: boolean;
  hasPrCreate: boolean;
}

function deriveState(input: DeriveStateInput): AgentState {
  // Latest run still open
  if (input.completedAt === null) {
    return input.latestHasToolCalls ? 'running' : 'initializing';
  }
  // Latest run completed
  if (input.exitCode !== null && input.exitCode !== 0) return 'error';
  if (input.hasPrCreate) return 'pr_open';
  return 'finished';
}
```

- [ ] **Step 4: Run the service test to verify it passes**

```bash
npm run test:run --workspace=crew-daemon -- AgentsService
```

Expected: PASS for all seven cases.

- [ ] **Step 5: Register `AgentsService` in the container**

Edit `packages/daemon/src/container.ts`. Add `AgentsService` to the imports and the cradle:

```typescript
import { AgentsService } from './services/AgentsService.js';
```

In the `DaemonCradle` interface, add:

```typescript
agentsService: AgentsService;
```

In `buildContainer`'s `container.register({...})` call, add:

```typescript
agentsService: asFunction(({ db }: DaemonCradle) => new AgentsService({ db })).scoped(),
```

- [ ] **Step 6: Write the failing route test**

Create `packages/daemon/src/routes/agents.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app.js';
import { parseDaemonConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { createDb, runMigrations } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function setupApp() {
  const dir = mkdtempSync(join(tmpdir(), 'crew-agents-route-'));
  tmpdirs.push(dir);
  const config = parseDaemonConfig({ CREW_CONFIG_DIR: dir });
  const logger = createLogger({ level: 'silent' });
  const db = createDb(config.dbFile);
  await runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp({ config, logger, db });
  return { app, db, dir };
}

describe('GET /api/agents', () => {
  it('returns an empty list when no agents are registered', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/agents' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ agents: [] });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns the registered agents derived from agents/runs/tool_calls', async () => {
    const { app, db } = await setupApp();
    try {
      await db
        .insertInto('agents')
        .values({
          key: 'KAN-1',
          project_name: 'demo',
          ticket_title: 'Demo title',
          worktree_path: '/x',
          branch: 'KAN-1',
          pr_url: null,
          created_at: '2026-04-29T12:00:00Z',
        })
        .execute();
      await db
        .insertInto('runs')
        .values({
          agent_key: 'KAN-1',
          command: 'run',
          session_id: 's1',
          started_at: '2026-04-29T12:00:00Z',
          completed_at: null,
          exit_code: null,
        })
        .execute();
      const res = await app.inject({ method: 'GET', url: '/api/agents' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        agents: [
          {
            key: 'KAN-1',
            projectName: 'demo',
            ticketTitle: 'Demo title',
            state: 'initializing',
            startedAt: '2026-04-29T12:00:00Z',
            tokens: 0,
          },
        ],
      });
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});
```

- [ ] **Step 7: Run route test to verify it fails**

```bash
npm run test:run --workspace=crew-daemon -- routes/agents
```

Expected: FAIL — route does not exist (404).

- [ ] **Step 8: Implement `packages/daemon/src/routes/agents.ts`**

```typescript
import type { DaemonApp } from '../app.js';
import { z } from 'zod';

const AgentSchema = z.object({
  key: z.string(),
  projectName: z.string(),
  ticketTitle: z.string(),
  state: z.enum(['initializing', 'running', 'pr_open', 'error', 'finished']),
  startedAt: z.string(),
  tokens: z.number(),
  prUrl: z.string().optional(),
});
const AgentsResponseSchema = z.object({ agents: z.array(AgentSchema) });

export async function registerAgentsRoutes(app: DaemonApp): Promise<void> {
  app.get(
    '/api/agents',
    { schema: { response: { 200: AgentsResponseSchema } } },
    async (req) => {
      const svc = req.diScope.resolve('agentsService');
      const agents = await svc.list();
      return { agents };
    },
  );
}
```

- [ ] **Step 9: Wire the route into `buildApp`**

Edit `packages/daemon/src/app.ts`. Add the import:

```typescript
import { registerAgentsRoutes } from './routes/agents.js';
```

After the existing `await registerProjectsRoutes(app);` line, add:

```typescript
  await registerAgentsRoutes(app);
```

- [ ] **Step 10: Run the route test to verify it passes**

```bash
npm run test:run --workspace=crew-daemon -- routes/agents
```

Expected: PASS for both cases.

- [ ] **Step 11: Run full daemon suite + typecheck**

```bash
npm run test:run --workspace=crew-daemon && npm run typecheck --workspace=crew-daemon
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add packages/daemon
git commit -m "feat(daemon): AgentsService.list + GET /api/agents (CREW-XX)"
```

---

## Task 5: `POST /api/agents/runs` + `POST .../runs/:runId/complete`

**Files:**
- Create: `packages/daemon/src/routes/runs.ts`
- Create: `packages/daemon/src/routes/runs.test.ts`
- Modify: `packages/daemon/src/container.ts` (register `IngestService`)
- Modify: `packages/daemon/src/app.ts` (start IngestService on ready, stop on close, register runs routes)

- [ ] **Step 1: Register `IngestService` in the container**

Edit `packages/daemon/src/container.ts`. Add the import:

```typescript
import { IngestService } from './services/IngestService.js';
```

In the `DaemonCradle` interface, add:

```typescript
ingestService: IngestService;
```

In `buildContainer`'s `container.register({...})` call, add (use `singleton()` — there is exactly one ingest service per daemon process):

```typescript
ingestService: asFunction(({ db, logger }: DaemonCradle) => new IngestService({ db, logger })).singleton(),
```

- [ ] **Step 2: Wire `IngestService.start` and `stop` into `buildApp`**

Edit `packages/daemon/src/app.ts`. After the `await app.register(fastifyAwilixPlugin, ...)` block, add:

```typescript
  // Resolve the ingest service via the diContainer's cradle (not request-scoped).
  const ingest = container.cradle.ingestService;
  app.addHook('onReady', async () => {
    await ingest.start();
  });
  app.addHook('onClose', async () => {
    await ingest.stop();
  });
```

(`container` is a local you'll need to extract — change the existing one-liner to `const container = buildContainer({ config, logger, db }); await app.register(fastifyAwilixPlugin, { container, ... });`. Update the `disposeOnClose: true` and other options to remain.)

- [ ] **Step 3: Write the failing test for the runs routes**

Create `packages/daemon/src/routes/runs.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app.js';
import { parseDaemonConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { createDb, runMigrations } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function setupApp() {
  const dir = mkdtempSync(join(tmpdir(), 'crew-runs-route-'));
  tmpdirs.push(dir);
  const config = parseDaemonConfig({ CREW_CONFIG_DIR: dir });
  const logger = createLogger({ level: 'silent' });
  const db = createDb(config.dbFile);
  await runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp({ config, logger, db });
  return { app, db };
}

const validBody = {
  key: 'KAN-1',
  projectName: 'demo',
  ticketTitle: 'Demo title',
  worktreePath: '/x',
  branch: 'KAN-1',
  sessionId: 's1',
  command: 'run' as const,
  startedAt: '2026-04-29T12:00:00Z',
};

describe('POST /api/agents/runs', () => {
  it('creates an agent + run on first call for a new key (201)', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: validBody,
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { agent: { key: string }; run: { id: number } };
      expect(body.agent.key).toBe('KAN-1');
      expect(body.run.id).toBeGreaterThan(0);

      const agents = await db.selectFrom('agents').selectAll().execute();
      expect(agents).toHaveLength(1);
      const runs = await db.selectFrom('runs').selectAll().execute();
      expect(runs).toHaveLength(1);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('upserts the agent on a second registration with a different session', async () => {
    const { app, db } = await setupApp();
    try {
      await app.inject({ method: 'POST', url: '/api/agents/runs', payload: validBody });
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/agents/runs',
        payload: { ...validBody, sessionId: 's2', command: 'fix-pr', ticketTitle: '' },
      });
      expect(res2.statusCode).toBe(201);
      const agents = await db.selectFrom('agents').selectAll().execute();
      expect(agents).toHaveLength(1);
      // ticket_title preserved (COALESCE on empty string)
      expect(agents[0]?.ticket_title).toBe('Demo title');
      const runs = await db.selectFrom('runs').orderBy('id').selectAll().execute();
      expect(runs).toHaveLength(2);
      expect(runs[1]?.command).toBe('fix-pr');
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns 409 on duplicate session_id', async () => {
    const { app, db } = await setupApp();
    try {
      await app.inject({ method: 'POST', url: '/api/agents/runs', payload: validBody });
      const res = await app.inject({ method: 'POST', url: '/api/agents/runs', payload: validBody });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'session_already_registered' });
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns 400 on invalid body (missing required field)', async () => {
    const { app, db } = await setupApp();
    try {
      const { sessionId: _omit, ...bad } = validBody;
      const res = await app.inject({ method: 'POST', url: '/api/agents/runs', payload: bad });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});

describe('POST /api/agents/runs/:runId/complete', () => {
  async function registerRun(app: Awaited<ReturnType<typeof setupApp>>['app']): Promise<number> {
    const res = await app.inject({ method: 'POST', url: '/api/agents/runs', payload: validBody });
    return (res.json() as { run: { id: number } }).run.id;
  }

  it('marks the run completed (204)', async () => {
    const { app, db } = await setupApp();
    try {
      const runId = await registerRun(app);
      const res = await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });
      expect(res.statusCode).toBe(204);
      const run = await db
        .selectFrom('runs')
        .selectAll()
        .where('id', '=', runId)
        .executeTakeFirst();
      expect(run?.completed_at).toBe('2026-04-29T13:00:00Z');
      expect(run?.exit_code).toBe(0);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns 404 when the run does not exist', async () => {
    const { app, db } = await setupApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/agents/runs/99999/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('returns 409 when the run is already completed', async () => {
    const { app, db } = await setupApp();
    try {
      const runId = await registerRun(app);
      await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/agents/runs/${runId}/complete`,
        payload: { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
npm run test:run --workspace=crew-daemon -- routes/runs
```

Expected: FAIL — routes do not exist.

- [ ] **Step 5: Implement `packages/daemon/src/routes/runs.ts`**

```typescript
import type { DaemonApp } from '../app.js';
import { z } from 'zod';
import { sql } from 'kysely';
import { join } from 'node:path';
import { claudeProjectDirFor } from 'crew-shared';

const RegisterRunBody = z.object({
  key: z.string().min(1),
  projectName: z.string().min(1),
  ticketTitle: z.string(),
  worktreePath: z.string().min(1),
  branch: z.string(),
  sessionId: z.string().min(1),
  command: z.enum(['run', 'fix-pr']),
  startedAt: z.string().min(1),
});

const RegisterRunResponse = z.object({
  agent: z.object({
    key: z.string(),
    projectName: z.string(),
    ticketTitle: z.string(),
    worktreePath: z.string(),
    branch: z.string(),
  }),
  run: z.object({
    id: z.number(),
    agentKey: z.string(),
    command: z.enum(['run', 'fix-pr']),
    sessionId: z.string(),
    startedAt: z.string(),
  }),
});

const CompleteRunBody = z.object({
  exitCode: z.number().int(),
  completedAt: z.string().min(1),
});

const CompleteRunParams = z.object({ runId: z.coerce.number().int().positive() });

export async function registerRunsRoutes(app: DaemonApp): Promise<void> {
  app.post(
    '/api/agents/runs',
    {
      schema: {
        body: RegisterRunBody,
        response: { 201: RegisterRunResponse },
      },
    },
    async (req, reply) => {
      const body = req.body;
      const db = req.diScope.resolve('db');
      const ingest = req.diScope.resolve('ingestService');
      const logger = req.diScope.resolve('logger');

      // Session uniqueness check up front for the clean 409 path.
      const existing = await db
        .selectFrom('runs')
        .select(['id'])
        .where('session_id', '=', body.sessionId)
        .executeTakeFirst();
      if (existing) {
        return reply
          .code(409)
          .send({ error: 'session_already_registered', runId: existing.id });
      }

      // Upsert the agent (preserve existing ticket_title when the new one is '').
      await db
        .insertInto('agents')
        .values({
          key: body.key,
          project_name: body.projectName,
          ticket_title: body.ticketTitle === '' ? null : body.ticketTitle,
          worktree_path: body.worktreePath,
          branch: body.branch,
          pr_url: null,
          created_at: new Date().toISOString(),
        })
        .onConflict((oc) =>
          oc.column('key').doUpdateSet({
            project_name: (eb) => eb.ref('excluded.project_name'),
            worktree_path: (eb) => eb.ref('excluded.worktree_path'),
            branch: (eb) => eb.ref('excluded.branch'),
            ticket_title: sql`COALESCE(NULLIF(excluded.ticket_title, ''), agents.ticket_title)`,
          }),
        )
        .execute();

      const inserted = await db
        .insertInto('runs')
        .values({
          agent_key: body.key,
          command: body.command,
          session_id: body.sessionId,
          started_at: body.startedAt,
          completed_at: null,
          exit_code: null,
        })
        .returning(['id', 'agent_key', 'command', 'session_id', 'started_at'])
        .executeTakeFirstOrThrow();

      const jsonlPath = join(claudeProjectDirFor(body.worktreePath), `${body.sessionId}.jsonl`);
      try {
        ingest.attach({ runId: inserted.id, jsonlPath });
      } catch (err) {
        logger.warn({ err, runId: inserted.id }, 'failed to attach ingest tail');
      }

      return reply.code(201).send({
        agent: {
          key: body.key,
          projectName: body.projectName,
          ticketTitle: body.ticketTitle,
          worktreePath: body.worktreePath,
          branch: body.branch,
        },
        run: {
          id: inserted.id,
          agentKey: inserted.agent_key,
          command: inserted.command as 'run' | 'fix-pr',
          sessionId: inserted.session_id,
          startedAt: inserted.started_at,
        },
      });
    },
  );

  app.post(
    '/api/agents/runs/:runId/complete',
    {
      schema: {
        params: CompleteRunParams,
        body: CompleteRunBody,
      },
    },
    async (req, reply) => {
      const { runId } = req.params;
      const { exitCode, completedAt } = req.body;
      const db = req.diScope.resolve('db');
      const ingest = req.diScope.resolve('ingestService');

      const run = await db
        .selectFrom('runs')
        .selectAll()
        .where('id', '=', runId)
        .executeTakeFirst();
      if (!run) return reply.code(404).send({ error: 'run_not_found', runId });
      if (run.completed_at !== null) {
        return reply.code(409).send({ error: 'run_already_completed', runId });
      }

      await db
        .updateTable('runs')
        .set({ completed_at: completedAt, exit_code: exitCode })
        .where('id', '=', runId)
        .execute();

      ingest.detach(runId);

      return reply.code(204).send();
    },
  );
}
```

- [ ] **Step 6: Wire the runs route into `buildApp`**

Edit `packages/daemon/src/app.ts`. Add the import:

```typescript
import { registerRunsRoutes } from './routes/runs.js';
```

After `await registerAgentsRoutes(app);`, add:

```typescript
  await registerRunsRoutes(app);
```

- [ ] **Step 7: Run route tests to verify they pass**

```bash
npm run test:run --workspace=crew-daemon -- routes/runs
```

Expected: PASS for all seven cases.

- [ ] **Step 8: Run full daemon suite + typecheck**

```bash
npm run test:run --workspace=crew-daemon && npm run typecheck --workspace=crew-daemon
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/daemon
git commit -m "feat(daemon): POST /api/agents/runs + complete endpoint, IngestService wiring (CREW-XX)"
```

---

## Task 6: CLI daemon-client + `crew run` integration

**Files:**
- Create: `packages/cli/src/lib/daemon-client/index.ts`
- Create: `packages/cli/src/lib/daemon-client/index.test.ts`
- Modify: `packages/cli/src/lib/index.ts` (re-export the daemon client)
- Modify: `packages/cli/src/commands/run.ts`

- [ ] **Step 1: Write the failing test for the daemon client**

Create `packages/cli/src/lib/daemon-client/index.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CrewDaemonClient } from './index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const validBody = {
  key: 'KAN-1',
  projectName: 'demo',
  ticketTitle: 'Demo title',
  worktreePath: '/x',
  branch: 'KAN-1',
  sessionId: 's1',
  command: 'run' as const,
  startedAt: '2026-04-29T12:00:00Z',
};

describe('CrewDaemonClient.registerRun', () => {
  it('POSTs the body and returns the response on 201', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            agent: { ...validBody },
            run: { id: 42, agentKey: 'KAN-1', command: 'run', sessionId: 's1', startedAt: validBody.startedAt },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.registerRun(validBody);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.run.id).toBe(42);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/agents/runs',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns ok:false on connection error without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const warn = vi.fn();
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn });
    const result = await client.registerRun(validBody);
    expect(result.ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('returns ok:false on non-2xx without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }));
    const warn = vi.fn();
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn });
    const result = await client.registerRun(validBody);
    expect(result.ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('CrewDaemonClient.completeRun', () => {
  it('POSTs and returns ok:true on 204', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.completeRun(42, { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' });
    expect(result.ok).toBe(true);
  });

  it('returns ok:false on connection error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const warn = vi.fn();
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn });
    const result = await client.completeRun(42, { exitCode: 0, completedAt: '2026-04-29T13:00:00Z' });
    expect(result.ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('crewDaemonClientFromEnv', () => {
  it('uses CREW_PORT when set', async () => {
    const { crewDaemonClientFromEnv } = await import('./index.js');
    const client = crewDaemonClientFromEnv({ CREW_PORT: '7799' });
    expect(client.baseUrl).toBe('http://localhost:7799');
  });

  it('defaults to 7773 when CREW_PORT is unset', async () => {
    const { crewDaemonClientFromEnv } = await import('./index.js');
    const client = crewDaemonClientFromEnv({});
    expect(client.baseUrl).toBe('http://localhost:7773');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:run --workspace=crew-cli -- daemon-client
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `packages/cli/src/lib/daemon-client/index.ts`**

```typescript
import pc from 'picocolors';

export interface RegisterRunInput {
  key: string;
  projectName: string;
  ticketTitle: string;
  worktreePath: string;
  branch: string;
  sessionId: string;
  command: 'run' | 'fix-pr';
  startedAt: string;
}

export interface RegisterRunSuccess {
  ok: true;
  agent: {
    key: string;
    projectName: string;
    ticketTitle: string;
    worktreePath: string;
    branch: string;
  };
  run: {
    id: number;
    agentKey: string;
    command: 'run' | 'fix-pr';
    sessionId: string;
    startedAt: string;
  };
}

export interface CompleteRunInput {
  exitCode: number;
  completedAt: string;
}

export type DaemonResult<T> = T | { ok: false; reason: string };

export interface CrewDaemonClientOptions {
  baseUrl: string;
  warn?: (message: string) => void;
}

const defaultWarn = (msg: string): void => {
  process.stderr.write(pc.yellow(`[crew-daemon] ${msg}\n`));
};

export class CrewDaemonClient {
  readonly baseUrl: string;
  private readonly warn: (msg: string) => void;

  constructor(opts: CrewDaemonClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.warn = opts.warn ?? defaultWarn;
  }

  async registerRun(input: RegisterRunInput): Promise<DaemonResult<RegisterRunSuccess>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/agents/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        this.warn(`registerRun: HTTP ${res.status} (run will not be tracked)`);
        return { ok: false, reason: `http_${res.status}` };
      }
      const body = (await res.json()) as Omit<RegisterRunSuccess, 'ok'>;
      return { ok: true, ...body };
    } catch (err) {
      this.warn(
        `registerRun: ${(err as Error).message} (daemon unreachable; run will not be tracked)`,
      );
      return { ok: false, reason: 'connect_error' };
    }
  }

  async completeRun(
    runId: number,
    input: CompleteRunInput,
  ): Promise<DaemonResult<{ ok: true }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/agents/runs/${runId}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        this.warn(`completeRun: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      this.warn(`completeRun: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }
}

export function crewDaemonClientFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): CrewDaemonClient {
  const port = env.CREW_PORT ?? '7773';
  return new CrewDaemonClient({ baseUrl: `http://localhost:${port}` });
}
```

- [ ] **Step 4: Add a barrel re-export from `crew-cli/lib`**

Edit `packages/cli/src/lib/index.ts`. Add the line:

```typescript
export * from './daemon-client/index.js';
```

- [ ] **Step 5: Run the daemon-client tests**

```bash
npm run test:run --workspace=crew-cli -- daemon-client
```

Expected: PASS for all six cases.

- [ ] **Step 6: Wire `crew run` to register the run after the transcript path resolves**

Edit `packages/cli/src/commands/run.ts`. Add the import near the existing `crew-shared` and lib imports:

```typescript
import { crewDaemonClientFromEnv } from '../lib/daemon-client/index.js';
import { basename } from 'node:path';
```

Find the block immediately after `const transcriptPath = await findNewestTranscript(projectDir, { signal: abort.signal });` and the early-return for missing transcript. After the existing `console.log(pc.dim(`→ watching ${transcriptPath}`));` line, BEFORE the `for await (const event of tailTranscript(...))` loop, add:

```typescript
  const sessionId = basename(transcriptPath, '.jsonl');
  const daemonClient = crewDaemonClientFromEnv(process.env);
  const startedAt = new Date().toISOString();
  const registration = await daemonClient.registerRun({
    key,
    projectName: config.name,
    ticketTitle: '',
    worktreePath: worktree,
    branch: key,
    sessionId,
    command: 'run',
    startedAt,
  });
  const runId = registration.ok ? registration.run.id : null;
```

> **ticketTitle:** slice 1b passes `''` and lets the daemon's COALESCE rule preserve any existing title. A future ticket plumbs Jira lookup into the registration call (it's not strictly required for slice 1b — the dashboard surface tolerates an empty title).

After the existing `const result = await claudeProcess;` line near the bottom (around line 247), and before `logStream.end();`, add the completion call:

```typescript
  if (runId !== null) {
    await daemonClient.completeRun(runId, {
      exitCode: result.exitCode ?? 1,
      completedAt: new Date().toISOString(),
    });
  }
```

- [ ] **Step 7: Run CLI tests + typecheck**

```bash
npm run test:run --workspace=crew-cli && npm run typecheck --workspace=crew-cli
```

Expected: PASS. (The existing `run.test.ts` mocks execa heavily; if it doesn't mock fetch, the daemon client's network call will fail gracefully — the warning will print but the test should still pass because `daemonClient.registerRun` returns `{ ok: false }` and the code continues. If a test asserts on stderr text it may need updating; check by running it.)

- [ ] **Step 8: Manual smoke test**

Start the daemon in one terminal:

```bash
mkdir -p /tmp/crew-1b-smoke/projects
# Reuse a real project's TOML or write a minimal one — see slice 1a's smoke for the format
CREW_CONFIG_DIR=/tmp/crew-1b-smoke npm run dev --workspace=crew-daemon
```

In another terminal, hit the new endpoint via `curl` to confirm round-trip:

```bash
curl -X POST http://localhost:7773/api/agents/runs \
  -H 'content-type: application/json' \
  -d '{"key":"KAN-99","projectName":"demo","ticketTitle":"Smoke","worktreePath":"/tmp/x","branch":"KAN-99","sessionId":"smoke-1","command":"run","startedAt":"2026-04-29T12:00:00Z"}'

curl -s http://localhost:7773/api/agents
```

Expected: 201 from POST; the `/api/agents` response includes `KAN-99` with state `initializing`.

Cleanup: stop the daemon, `rm -rf /tmp/crew-1b-smoke`.

- [ ] **Step 9: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): daemon-client + crew run registers/completes runs (CREW-XX)"
```

---

## Task 7: `crew fix-pr` integration

**Files:**
- Modify: `packages/cli/src/commands/fix-pr.ts`

- [ ] **Step 1: Add the same daemon-client wiring to `crew fix-pr`**

Read `packages/cli/src/commands/fix-pr.ts`. Identify:
- The line where the project config is loaded (typically `const config = await discoverProjectConfig(...)`).
- The line where the claude process is spawned (`execa('claude', ...)`).
- The line where `findNewestTranscript` resolves the transcript path.
- The line where `await claudeProcess` resolves.

Add the imports near the existing imports:

```typescript
import { crewDaemonClientFromEnv } from '../lib/daemon-client/index.js';
import { basename } from 'node:path';
```

After the `findNewestTranscript` call resolves (and the early-exit-if-missing block), before the tail loop, add:

```typescript
  const sessionId = basename(transcriptPath, '.jsonl');
  const daemonClient = crewDaemonClientFromEnv(process.env);
  const startedAt = new Date().toISOString();
  const registration = await daemonClient.registerRun({
    key,
    projectName: config.name,
    ticketTitle: '',
    worktreePath: worktree,
    branch: key,
    sessionId,
    command: 'fix-pr',
    startedAt,
  });
  const runId = registration.ok ? registration.run.id : null;
```

(Note: `worktree` and `key` are already in scope in fix-pr.ts; if your local variable names differ, use the existing names.)

After `await claudeProcess` resolves, before any final cleanup, add:

```typescript
  if (runId !== null) {
    await daemonClient.completeRun(runId, {
      exitCode: result.exitCode ?? 1,
      completedAt: new Date().toISOString(),
    });
  }
```

- [ ] **Step 2: Run CLI tests + typecheck**

```bash
npm run test:run --workspace=crew-cli && npm run typecheck --workspace=crew-cli
```

Expected: PASS. (Same caveat as Task 6 about the existing `fix-pr.test.ts` — review if it asserts on stderr text.)

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/fix-pr.ts
git commit -m "feat(cli): crew fix-pr registers/completes runs with the daemon (CREW-XX)"
```

---

## Task 8: Dashboard wiring — `HttpDaemonClient`, polling, delete temporaries

**Files:**
- Create: `packages/dashboard/src/data/HttpDaemonClient.ts`
- Create: `packages/dashboard/src/data/HttpDaemonClient.test.ts`
- Delete: `packages/dashboard/src/data/HttpProjectsClient.ts`
- Delete: `packages/dashboard/src/data/HttpProjectsClient.test.ts`
- Delete: `packages/dashboard/src/data/HybridDaemonClient.ts`
- Delete: `packages/dashboard/src/data/HybridDaemonClient.test.ts`
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/App.test.tsx`

- [ ] **Step 1: Write the failing test for `HttpDaemonClient`**

Create `packages/dashboard/src/data/HttpDaemonClient.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpDaemonClient } from './HttpDaemonClient.js';

afterEach(() => vi.restoreAllMocks());

describe('HttpDaemonClient.listProjects', () => {
  it('GETs /api/projects and returns the array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ projects: [{ name: 'demo', repoPath: '/x' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new HttpDaemonClient();
    expect(await client.listProjects()).toEqual([{ name: 'demo', repoPath: '/x' }]);
  });

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }));
    await expect(new HttpDaemonClient().listProjects()).rejects.toThrow(/500/);
  });

  it('throws on schema mismatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ wrong: 'shape' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(new HttpDaemonClient().listProjects()).rejects.toThrow();
  });
});

describe('HttpDaemonClient.listAgents', () => {
  it('GETs /api/agents and returns the array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          agents: [
            {
              key: 'KAN-1',
              projectName: 'demo',
              ticketTitle: 'Demo',
              state: 'running',
              startedAt: '2026-04-29T12:00:00Z',
              tokens: 42,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const agents = await new HttpDaemonClient().listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ key: 'KAN-1', state: 'running', tokens: 42 });
  });

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }));
    await expect(new HttpDaemonClient().listAgents()).rejects.toThrow(/500/);
  });

  it('throws on schema mismatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ agents: [{ key: 'KAN-1' /* missing fields */ }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(new HttpDaemonClient().listAgents()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run --workspace=crew-dashboard -- HttpDaemonClient
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `packages/dashboard/src/data/HttpDaemonClient.ts`**

```typescript
import { z } from 'zod';
import type { DaemonClient } from './DaemonClient.js';
import type { Agent, Project } from './types.js';

const ProjectsResponseSchema = z.object({
  projects: z.array(z.object({ name: z.string(), repoPath: z.string() })),
});

const AgentSchema = z.object({
  key: z.string(),
  projectName: z.string(),
  ticketTitle: z.string(),
  state: z.enum(['initializing', 'running', 'pr_open', 'error', 'finished']),
  startedAt: z.string(),
  tokens: z.number(),
  prUrl: z.string().optional(),
});
const AgentsResponseSchema = z.object({ agents: z.array(AgentSchema) });

export class HttpDaemonClient implements DaemonClient {
  constructor(private readonly baseUrl: string = '') {}

  async listProjects(): Promise<Project[]> {
    const res = await fetch(`${this.baseUrl}/api/projects`);
    if (!res.ok) throw new Error(`GET /api/projects: ${res.status}`);
    return ProjectsResponseSchema.parse(await res.json()).projects;
  }

  async listAgents(): Promise<Agent[]> {
    const res = await fetch(`${this.baseUrl}/api/agents`);
    if (!res.ok) throw new Error(`GET /api/agents: ${res.status}`);
    return AgentsResponseSchema.parse(await res.json()).agents;
  }
}
```

- [ ] **Step 4: Run the new test to verify it passes**

```bash
npm run test:run --workspace=crew-dashboard -- HttpDaemonClient
```

Expected: PASS.

- [ ] **Step 5: Update `App.tsx`**

Edit `packages/dashboard/src/App.tsx`. Replace the lines that import `HttpProjectsClient`, `HybridDaemonClient`, and `MockDaemonClient`, plus the `defaultClient` declaration, with:

```typescript
import { HttpDaemonClient } from './data/HttpDaemonClient.js';
```

Update `defaultClient`:

```typescript
const defaultClient: DaemonClient = new HttpDaemonClient();
```

Update both `useQuery` calls to add `refetchInterval: 2000`:

```typescript
const projectsQuery = useQuery({
  queryKey: ['projects'],
  queryFn: () => client.listProjects(),
  refetchInterval: 2000,
});
const agentsQuery = useQuery({
  queryKey: ['agents'],
  queryFn: () => client.listAgents(),
  refetchInterval: 2000,
});
```

Remove the now-unused `MockDaemonClient` import (it's only used in tests).

- [ ] **Step 6: Update `App.test.tsx`**

Read `packages/dashboard/src/App.test.tsx`. Find any place that constructs `HybridDaemonClient` (introduced by slice 1a's CREW-38) or that mocks `globalThis.fetch` to feed `HttpProjectsClient`. Replace with direct `MockDaemonClient` injection:

```typescript
import { MockDaemonClient } from './data/MockDaemonClient.js';

// in each render call:
render(<App client={new MockDaemonClient()} />);
```

If the existing test injected `vi.spyOn(globalThis, 'fetch')` to feed projects, that block can be removed — `MockDaemonClient` returns the same fixtures synchronously without any HTTP layer.

- [ ] **Step 7: Delete the temporary clients**

```bash
rm packages/dashboard/src/data/HttpProjectsClient.ts \
   packages/dashboard/src/data/HttpProjectsClient.test.ts \
   packages/dashboard/src/data/HybridDaemonClient.ts \
   packages/dashboard/src/data/HybridDaemonClient.test.ts
```

- [ ] **Step 8: Run dashboard tests + typecheck**

```bash
npm run test:run --workspace=crew-dashboard && npm run typecheck --workspace=crew-dashboard
```

Expected: PASS.

- [ ] **Step 9: Manual end-to-end smoke**

In one terminal, start the daemon with a real project TOML (or with the smoke setup from Task 6 Step 8). In another, run `npm run dev --workspace=crew-dashboard`. Open `http://localhost:5173`. Run `crew run KAN-XX` in a third terminal against a real project; observe the agent appear in the dashboard's list within ~2 seconds (the polling refetchInterval).

- [ ] **Step 10: Commit**

```bash
git add packages/dashboard
git commit -m "feat(dashboard): HttpDaemonClient + polling for live data, drop Hybrid (CREW-XX)"
```

---

## Final verification

- [ ] **Step 1: Full repo test run**

```bash
npm run test:run
```

Expected: PASS across all workspaces.

- [ ] **Step 2: Lint + format**

```bash
npm run lint && npm run format:check
```

Expected: no errors / no diffs.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: End-to-end manual smoke**

Daemon up with a registered project; dashboard dev server up; run `crew run KAN-XX` against the project. Verify in the dashboard:

1. The agent appears within ~2s in `initializing` state.
2. State transitions to `running` once tool calls start landing.
3. Token count rises as the run progresses.
4. When claude exits successfully without a PR, state lands on `finished`.
5. When the run created a PR (`gh pr create` observed in tool calls), state lands on `pr_open`.
6. When claude exits non-zero, state lands on `error`.

Stop the daemon, restart it, verify open runs resume tailing (the recovery path exercised in `IngestService.start`).
