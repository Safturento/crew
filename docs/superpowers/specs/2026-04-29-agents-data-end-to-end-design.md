# Agents data end-to-end (slice 1b) — design

> **Purpose of this document.** A scoped design spec for slice 1b of the dashboard-data work: stand up SQLite + a chokidar-driven transcript watcher in the daemon, expose `GET /api/agents` returning real data joined from registered runs and ingested tool-call events, and wire the dashboard's agents list to it (deleting the temporary `HybridDaemonClient`). SSE / live-update push is deferred to slice 1c; this slice ships polling via TanStack Query's `refetchInterval`.
>
> Read [`2026-04-28-daemon-bootstrap-and-projects-endpoint-design.md`](./2026-04-28-daemon-bootstrap-and-projects-endpoint-design.md) (slice 1a) and [`docs/plans/architecture.md`](../../plans/architecture.md) first. This spec assumes the daemon is already running with the Fastify + Awilix + Kysely + pino stack established in 1a.

## 1. Stack

Unchanged from slice 1a — Fastify, Awilix, Zod, Kysely + `kysely-better-sqlite3`, pino, Vitest. New runtime dependencies added by this slice:

| Concern | Pick | Notes |
|---|---|---|
| File watching | **chokidar** | Used narrowly: one watcher per active session JSONL, with `awaitWriteFinish` so we don't fire on the in-progress write of the first line. Not a recursive watch on `~/.claude/projects/*/`. |
| Tail abstraction | reuse `tailTranscript` | Already exists at `packages/cli/src/lib/transcripts/tail.ts`; moves to `crew-shared` (Phase 1.5 step 2) so daemon and CLI share it. |
| Transcript parsing | reuse `parseTranscript` / `parseToolCall` / `aggregateUsage` | Same module, same move. |

## 2. Scope

**In scope for slice 1b:**

- First Kysely migration creating `agents`, `runs`, `tool_calls` tables (full DDL in §3).
- `crew-shared` extraction of `cli/src/lib/transcripts/{parser.ts,tail.ts,types.ts}` and `cli/src/lib/run/claudeProjectDirFor` (the worktree → JSONL-directory helper). CLI's existing imports update to `crew-shared`.
- New daemon services: `IngestService` (chokidar-driven JSONL ingestion → `tool_calls` rows + `pr_url` updates) and `AgentsService` (Kysely query joining agents → latest run → token aggregates → derived state).
- Two new run-lifecycle endpoints: `POST /api/agents/runs` (CLI registers a new run, creating the agent record on first call for a key) and `POST /api/agents/runs/:runId/complete` (CLI signals exit code).
- `GET /api/agents` returning the real list in the dashboard's existing `Agent` shape.
- `crew run` and `crew fix-pr` updated to call both endpoints (registration after spawn; completion after the awaited claude process exits).
- Dashboard's `HttpDaemonClient` implementing both methods (replacing the temporary `HttpProjectsClient` + `HybridDaemonClient` pair from 1a). `HybridDaemonClient.ts` and its test deleted.
- `useQuery` calls in `App.tsx` gain `refetchInterval: 2000` so the agents list and projects list stay fresh without manual refresh.

**Explicitly out of scope (deferred):**

- SSE / `GET /events` — slice 1c.
- `crew finish` integration with the daemon — the data model already supports it (no agent record changes when `finish` runs); the dashboard's "archive" gesture lands when slice 1c+ surfaces it.
- `idle` and `waiting` states — see §6.
- `GET /api/agents/:key` (single agent + transcript), `GET /api/agents/:key/state-history`, drawer/timeline endpoints — slice 1c.
- Bruno collection covering the new endpoints — handled under the existing "Bruno collection for crew's own daemon API" prereq ticket, not gating this slice.
- Any service beyond `AgentsService` and `IngestService`.

## 3. Schema (first Kysely migration)

```sql
CREATE TABLE agents (
  key            TEXT PRIMARY KEY,
  project_name   TEXT NOT NULL,
  ticket_title   TEXT,
  worktree_path  TEXT NOT NULL,
  branch         TEXT,
  pr_url         TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_key      TEXT NOT NULL REFERENCES agents(key),
  command        TEXT NOT NULL CHECK(command IN ('run','fix-pr','finish')),
  session_id     TEXT NOT NULL UNIQUE,
  started_at     TEXT NOT NULL,
  completed_at   TEXT,
  exit_code      INTEGER
);
CREATE INDEX idx_runs_agent_key ON runs(agent_key);

CREATE TABLE tool_calls (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id                 INTEGER NOT NULL REFERENCES runs(id),
  tool_name              TEXT NOT NULL,
  input_summary          TEXT,
  output_tokens          INTEGER NOT NULL DEFAULT 0,
  input_tokens           INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens  INTEGER NOT NULL DEFAULT 0,
  occurred_at            TEXT NOT NULL
);
CREATE INDEX idx_tool_calls_run_id ON tool_calls(run_id);
```

**Decisions baked in:**

- `agents.key` is the primary key (no surrogate id). Matches the "one agent per ticket" rule from the dashboard spec; makes joins natural.
- `runs.session_id` carries a `UNIQUE` constraint — claude session IDs are GUIDs, never reused; this protects against accidental double-registration of the same session.
- `runs.command` includes `'finish'` in the CHECK list even though slice 1b doesn't wire `crew finish`; including it now means a future migration won't be needed when finish integration lands.
- `tool_calls` stores **summary strings, not raw JSON inputs**. The dashboard's agents list renders summaries; the drawer (slice 1c) can re-parse from the original JSONL on demand if it ever needs the full input.
- No `state_transitions` table. State is derived per-query (§6). When slice 1c's drawer needs per-segment history, denormalization can be added then.
- Token columns mirror the four fields in `aggregateUsage()`'s output for parity with the existing parser; the dashboard currently surfaces only the total, but the breakdown is stored so the drawer's `TokenTable` (slice 1c) doesn't need a re-ingest.

The migration file is `packages/daemon/src/migrations/0001_agents_runs_tool_calls.ts` exporting `up` and `down` functions in Kysely's standard shape. No previous migration exists; `runMigrations()` (already wired in 1a) will run this one on next daemon start.

## 4. Run lifecycle (CLI ↔ daemon contract)

Two endpoints. The CLI calls both. No daemon-side inference of completion from filesystem staleness — the CLI already holds the `claudeProcess` handle and knows the exit code precisely; passing it through is cheaper and more accurate.

### 4a. `POST /api/agents/runs`

Body (Zod-validated):

```ts
{
  key: string;            // 'KAN-31'
  projectName: string;    // matches a registered project's TOML name
  ticketTitle: string;    // from Jira at start; '' if Jira lookup failed (CLI swallows the error and proceeds)
  worktreePath: string;
  branch: string;
  sessionId: string;      // claude session id (the .jsonl basename without extension)
  command: 'run' | 'fix-pr';
  startedAt: string;      // ISO 8601
}
```

Behavior:

1. Upsert the `agents` row (`INSERT ... ON CONFLICT(key) DO UPDATE SET project_name = excluded.project_name, worktree_path = excluded.worktree_path, branch = excluded.branch, ticket_title = COALESCE(NULLIF(excluded.ticket_title, ''), agents.ticket_title)`). The `COALESCE`-on-empty rule means a `fix-pr` call with an empty title (Jira hiccup) won't blow away a title we already had from the original `run`.
2. Insert a `runs` row with `completed_at = NULL`, `exit_code = NULL`. The `UNIQUE(session_id)` constraint catches double-registration; on conflict the daemon returns 409 `{ error: 'session_already_registered', runId: <existing> }`.
3. Hand the run off to `IngestService.attach({ runId, sessionId, worktreePath })`, which begins tailing the corresponding JSONL.
4. Respond `201 { agent: AgentSummary, run: { id, agentKey, command, sessionId, startedAt } }`.

### 4b. `POST /api/agents/runs/:runId/complete`

Body:

```ts
{ exitCode: number; completedAt: string }
```

Behavior:

1. `UPDATE runs SET completed_at = ?, exit_code = ? WHERE id = ?`. If the row doesn't exist or was already completed, return 404 / 409 respectively.
2. `IngestService.detach(runId)` — aborts the tail's `AbortController`. The tail loop (per `tailTranscript`'s contract) drains one final poll cycle before exiting, so any trailing tool-call events written during process teardown are still ingested.
3. Respond `204` (no body).

### 4c. CLI changes

In `packages/cli/src/commands/run.ts`:

- After the `claudeProcess` is spawned and `findNewestTranscript(projectDir)` resolves the JSONL path, **register the run** via `daemonClient.registerRun({...})`. The CLI now needs a thin daemon HTTP client; lives at `packages/cli/src/lib/daemon-client/index.ts` (new module — not in `crew-shared` because the dashboard doesn't reuse this contract).
- After `await claudeProcess` resolves at line ~247, **complete the run** with `result.exitCode ?? 0`. Failures are logged but non-fatal (the daemon may be down; `crew run` shouldn't fail because of it).

In `packages/cli/src/commands/fix-pr.ts`: same pattern. The `fix-pr` flow already loads the project config (after the recent merge) so the registration body is computable at the same point in the flow.

**Daemon client base URL:** the CLI's daemon client reads `process.env.CREW_PORT` (defaulting to `7773`) and points at `http://localhost:${port}`. No env override for host — the daemon is localhost-only by design.

**Daemon client error handling:** `daemonClient.registerRun` and `daemonClient.completeRun` swallow connection errors with a yellow warning to stderr and a return value indicating "not registered." This preserves crew's "personal-tool, daemon is optional" posture — the agent runs the same whether the dashboard is observing or not.

## 5. Watcher + ingest service

> **Project-specific:** lives at `packages/daemon/src/services/IngestService.ts`. Registered in the Awilix container alongside `ProjectsService` and `AgentsService`.

**Public interface:**

```ts
export class IngestService {
  constructor(deps: { db: Kysely<Database>; logger: Logger; configDir: string; });
  async start(): Promise<void>;             // called from app boot; resumes tails for any open runs
  attach(input: { runId: number; sessionId: string; worktreePath: string }): void;
  detach(runId: number): void;
  async stop(): Promise<void>;              // called from Fastify's onClose; aborts all tails
}
```

**Lifecycle wiring:**

- `app.ts` resolves the `IngestService` from the container in its `onReady` hook and calls `start()`.
- `app.ts`'s `onClose` hook calls `stop()`.

**`start()`:**

1. Query `runs WHERE completed_at IS NULL`, joined with `agents` for the `worktree_path`.
2. For each, call `attach({ runId, sessionId, worktreePath })`. (This is the crash-recovery path — if the daemon restarts mid-run, in-flight tails resume from where the file is now, not from the beginning. `tailTranscript`'s `startAtEnd` mode covers this.)

**`attach()`:**

1. Compute the JSONL path: `claudeProjectDirFor(worktreePath) + '/' + sessionId + '.jsonl'`. (`claudeProjectDirFor` moves to `crew-shared` as part of this slice.)
2. Set up an `AbortController` keyed on `runId`; record it in an in-memory map `Map<runId, AbortController>`.
3. Kick off an async iterator loop over `tailTranscript(path, { signal: abortController.signal, startAtEnd: false })`. For each event, call `ingestEvent(runId, event)` (private helper).
4. The loop runs in the background — `attach()` is fire-and-forget. Errors inside the loop are caught and logged at `warn` level; they do not crash the daemon.

**`detach(runId)`:**

1. Look up the abort controller from the map.
2. `controller.abort()`. The tail's contract guarantees a final drain pass after abort, so any trailing events are still processed before the iterator returns.
3. Remove the entry from the map.

**`ingestEvent(runId, event)`:**

1. If `event.type !== 'assistant'`, return early. (We only persist tool calls in slice 1b. Other event types — `user`, `system`, `permission-mode` — are noise for the agents list and are slice 1c's concern.)
2. Run `parseToolCall(event)`. If it returns null (assistant message without a `tool_use` block — e.g. plain text response), return early.
3. Build the `input_summary` via the existing `summarizeInput()` helper from `parser.ts` (which `formatToolCall` already uses internally; we'll export it from the moved module).
4. `INSERT INTO tool_calls (run_id, tool_name, input_summary, output_tokens, input_tokens, cache_read_tokens, cache_creation_tokens, occurred_at) VALUES (...)`.
5. **No PR URL extraction in slice 1b.** The `agents.pr_url` column is added now (forward compat) but stays `NULL` for the duration of this slice. State still flips to `pr_open` based purely on the presence of a `gh pr create` tool_call (the §6 derivation rules don't touch `pr_url`). Extracting the actual URL requires either parsing the next assistant message for the URL string, or loading the project's github repo from its TOML to construct a search URL — both are scope crowders for an already-large slice. Slice 1c's drawer needs to parse transcripts in detail anyway, so PR URL extraction lands cleanly there.

**chokidar usage:** intentionally narrow. We do **not** recursively watch `~/.claude/projects/*/`. The watcher is only attached **per-session**, by path, with `awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 }` so it doesn't fire on the in-progress write of the JSONL's first line. `tailTranscript` itself is poll-based and handles the file-not-yet-existing case; chokidar is only used inside the daemon for the boot-time recovery path's existence check. (If `tailTranscript` proves sufficient on its own, chokidar can be dropped — see §10 open questions.)

## 6. State derivation

Computed live in `AgentsService.list()`. Single Kysely query joins `agents` with the latest `runs` row (`ROW_NUMBER() OVER (PARTITION BY agent_key ORDER BY id DESC) = 1`) and aggregates over all of an agent's runs/tool_calls.

| Condition | State |
|---|---|
| Latest run is open (`completed_at IS NULL`) AND zero tool_calls | `initializing` |
| Latest run is open AND ≥1 tool_call | `running` |
| Latest run completed with `exit_code = 0` AND any tool_call across the agent's runs has `tool_name = 'Bash'` AND `input_summary LIKE 'gh pr create%'` | `pr_open` |
| Latest run completed with `exit_code = 0` AND no `gh pr create` ever observed | `finished` |
| Latest run completed with `exit_code != 0` | `error` |

**`idle` and `waiting` are not emitted in slice 1b.** The dashboard's `STATE_META` continues to define them (the type is unchanged), but the daemon currently has no clean signal to derive them from in headless mode:

- `waiting` was specced for "agent has asked operator a question," which doesn't happen in `--dangerously-skip-permissions -p` mode (claude doesn't prompt mid-run).
- `idle` was specced for "agent has nothing to do (waiting on external trigger)," which is genuinely fuzzy without explicit pause/resume signaling.

Both can be revisited in slice 1c when the drawer's state-history surface makes them useful and visible.

## 7. `AgentsService.list` + `GET /api/agents`

`AgentsService.list()` returns `Agent[]` matching the dashboard's existing type. The Kysely query (sketch):

```ts
const rows = await db
  .selectFrom('agents as a')
  .leftJoin(
    db
      .selectFrom('runs')
      .selectAll()
      .select((eb) => eb.fn.coalesce('exit_code', sql<number | null>`null`).as('exit_code_safe'))
      .as('latest_run'),
    (join) =>
      join
        .onRef('latest_run.agent_key', '=', 'a.key')
        .on('latest_run.id', '=', sql`(SELECT id FROM runs r2 WHERE r2.agent_key = a.key ORDER BY id DESC LIMIT 1)`),
  )
  .leftJoin(
    db
      .selectFrom('tool_calls as tc')
      .innerJoin('runs as r', 'r.id', 'tc.run_id')
      .select(['r.agent_key as agent_key'])
      .select((eb) => eb.fn.sum<number>('tc.output_tokens').as('output_tokens'))
      .select((eb) => eb.fn.sum<number>('tc.input_tokens').as('input_tokens'))
      .select((eb) => eb.fn.sum<number>('tc.cache_read_tokens').as('cache_read_tokens'))
      .select((eb) => eb.fn.sum<number>('tc.cache_creation_tokens').as('cache_creation_tokens'))
      .select((eb) => eb.fn.count<number>('tc.id').as('tool_call_count'))
      .select((eb) => eb.fn.max<number>(sql<number>`CASE WHEN tc.tool_name = 'Bash' AND tc.input_summary LIKE 'gh pr create%' THEN 1 ELSE 0 END`).as('has_pr_create'))
      .groupBy('r.agent_key')
      .as('totals'),
    (join) => join.onRef('totals.agent_key', '=', 'a.key'),
  )
  .selectAll('a')
  .select(['latest_run.completed_at', 'latest_run.exit_code', 'latest_run.started_at as run_started_at'])
  .select(['totals.output_tokens', 'totals.input_tokens', 'totals.cache_read_tokens', 'totals.cache_creation_tokens', 'totals.tool_call_count', 'totals.has_pr_create'])
  .execute();
```

The service then maps each row to an `Agent` object with state derived per §6 and `tokens` set to the sum across all four token columns (matching what `aggregateUsage()` rolls up — this is the same number the dashboard already shows for fixture data).

The route file follows 1a's pattern:

```
src/routes/agents.ts        # GET /api/agents — Zod response schema, resolves agentsService from req.diScope
```

Response shape:

```ts
{
  agents: Array<{
    key: string;
    projectName: string;
    ticketTitle: string;
    state: 'initializing' | 'running' | 'pr_open' | 'error' | 'finished';
    startedAt: string;          // run_started_at of the latest run (matches the dashboard's existing type)
    tokens: number;
    prUrl?: string;             // present when pr_url is non-null
  }>;
}
```

The `state` literal union is narrower than the dashboard's full `AgentState` (which also has `idle` and `waiting`); narrowing on the wire keeps the wire contract honest about what we actually emit, and the dashboard's type accepts the subset trivially.

## 8. Dashboard wiring

`packages/dashboard/src/data/HttpDaemonClient.ts` (new, replaces the `HttpProjectsClient` + `HybridDaemonClient` pair):

```ts
import { z } from 'zod';
import type { DaemonClient } from './DaemonClient.js';
import type { Agent, Project } from './types.js';

const ProjectsResponseSchema = z.object({ projects: z.array(z.object({ name: z.string(), repoPath: z.string() })) });
const AgentsResponseSchema = z.object({
  agents: z.array(
    z.object({
      key: z.string(),
      projectName: z.string(),
      ticketTitle: z.string(),
      state: z.enum(['initializing', 'running', 'pr_open', 'error', 'finished']),
      startedAt: z.string(),
      tokens: z.number(),
      prUrl: z.string().optional(),
    }),
  ),
});

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

**Files deleted by this slice:**

- `packages/dashboard/src/data/HttpProjectsClient.ts`
- `packages/dashboard/src/data/HttpProjectsClient.test.ts`
- `packages/dashboard/src/data/HybridDaemonClient.ts`
- `packages/dashboard/src/data/HybridDaemonClient.test.ts`

`App.tsx` change: `defaultClient` switches to `new HttpDaemonClient()`. Both `useQuery` calls gain `refetchInterval: 2000`:

```ts
useQuery({
  queryKey: ['projects'],
  queryFn: () => client.listProjects(),
  refetchInterval: 2000,
});
useQuery({
  queryKey: ['agents'],
  queryFn: () => client.listAgents(),
  refetchInterval: 2000,
});
```

`MockDaemonClient` stays — useful for tests, including `App.test.tsx` (which switches from injecting a hybrid to injecting a plain mock).

## 9. Tests

| Surface | Test |
|---|---|
| Migration | Vitest. Run the migration up against a fresh tmpdir DB; assert the tables/columns/indexes exist via `sqlite_master`. Run down; assert tables are dropped. |
| `IngestService.ingestEvent` | Vitest. Construct with a tmpdir DB and a fixture transcript event; assert `tool_calls` rows match expectation for assistant-with-tool-use, assistant-without-tool-use (no row), non-assistant types (no row), and a `gh pr create` Bash event (row inserted, summary matches). |
| `IngestService.attach` + JSONL tail | Vitest with a fixture JSONL file written incrementally via `fs.appendFile`. Attach, write three events with delays, assert three `tool_calls` rows land. Then call `detach`, write a fourth event, assert it does *not* land. |
| `IngestService.start` recovery | Vitest. Pre-populate `runs` with two open rows + their JSONL files. Call `start()`. Append events to one of the files. Assert tool_calls land. |
| `AgentsService.list` | Vitest, fixture-DB-driven. Cover each state: agent registered with no run yet (`initializing`), agent with running tool calls (`running`), `pr_open`, `finished`, `error`. Cover token aggregation across multiple runs of the same agent. |
| `POST /api/agents/runs` route | `app.inject`. Cover: new agent (creates row + run), existing agent (updates row, creates new run), session-id collision (409), invalid project name (400 via Zod). |
| `POST /api/agents/runs/:runId/complete` route | `app.inject`. Cover: run exists and open (204, ingest detached), run already completed (409), run not found (404). |
| `GET /api/agents` route | `app.inject`. Cover: empty DB (returns `{ agents: [] }`), populated DB (returns the expected list including the derived state). |
| `daemon-client/registerRun` + `completeRun` (CLI) | Vitest with a stubbed fetch. Cover: 201 response (parses agent + run), connection error (returns `{ ok: false }`, logs warning, doesn't throw). |
| `runTicket` integration (CLI) | Extend the existing `run.test.ts` to assert the daemon client is called with the expected payload at registration time and at completion time. Use the mocked-execa harness already in place. |
| Dashboard `HttpDaemonClient` | Vitest with `fetch` stub. Cover both methods: happy path, schema-mismatch throw, non-2xx throw. |
| Dashboard `App.test.tsx` | Update to inject `MockDaemonClient` directly (Hybrid is gone). Existing assertions unchanged. |

## 10. Failure modes & open questions

**Daemon down when CLI is running:** registration / completion calls log a yellow warning and proceed. The agent runs the same; the daemon just won't show it. (This is the "personal-tool, daemon-optional" posture from architecture.md.)

**JSONL file appears late:** `tailTranscript` already polls and survives the file-not-yet-existing case. `awaitWriteFinish` covers the in-progress-write case for chokidar's existence check.

**Daemon restart mid-run:** crash-recovery via `IngestService.start()` — open runs resume from current file position (`startAtEnd: true` is *not* used at recovery time; we want all events since the last ingest, but on restart the tool_calls table already has what was ingested before the crash, so resuming from beginning would dedupe via the implicit "the file is append-only and ingest is idempotent on (run_id, occurred_at)" property — actually we should add a unique constraint or do a `WHERE NOT EXISTS` check; see open question below).

**Open questions tagged for follow-up:**

1. **chokidar vs. pure `tailTranscript`.** `tailTranscript` already polls and survives the missing-file case. chokidar's `awaitWriteFinish` is belt-and-suspenders. If integration testing shows the polling tail is sufficient on its own, drop chokidar and the runtime dep. (Decision deferred until implementation; the spec retains chokidar as the safer initial pick.)
2. **Idempotent ingest on daemon restart.** The cleanest fix is a `UNIQUE(run_id, occurred_at, tool_name)` index on `tool_calls` plus `INSERT OR IGNORE`. Adding it now is cheap; doing it later requires a migration. Recommendation: add the unique index in the migration. (Plan should include this, even though the spec narrative above implied it as a "follow-up" — sharper to do it once in the right place.)
3. **`gh pr create` URL extraction.** Slice 1b's "best-effort filter URL" is acceptable; slice 1c's drawer will parse the next assistant message for the actual PR URL.
4. **Tail backpressure.** If a long-running agent produces tool calls faster than ingest writes, the in-memory event queue could grow. In practice the rate is bounded (claude output is gated by API roundtrips), but worth keeping an eye on. No action needed for slice 1b.

## 11. Hand-off to writing-plans

The implementation plan should sequence:

1. **Shared extraction** — move `transcripts/{parser,tail,types}.ts` and `claudeProjectDirFor` to `crew-shared`. Update CLI imports. (Mirrors slice 1a's first ticket — small, low-risk, unblocks daemon.)
2. **Migration + Kysely types** — author migration `0001_agents_runs_tool_calls.ts` with the unique index from §10 open question 2 included. Generate / hand-write the `Database` type that Kysely consumes.
3. **`IngestService`** — implementation + unit tests. Includes tail-attach, ingest, detach, recovery (`start()`).
4. **`AgentsService.list` + `GET /api/agents`** — Kysely query, state derivation, route + Zod schemas + tests.
5. **`POST /api/agents/runs` + `POST /api/agents/runs/:runId/complete`** — routes, request validation, `IngestService.attach`/`detach` wiring, tests.
6. **CLI daemon-client + `crew run` integration** — `packages/cli/src/lib/daemon-client/`, plus the registration + completion calls in `runTicket`.
7. **`crew fix-pr` integration** — same daemon-client, slotted into `runFixPr` at the analogous points.
8. **Dashboard wiring** — `HttpDaemonClient` consolidates the two earlier clients, `Hybrid*` files deleted, App switches default client and adds `refetchInterval`, tests updated.

Tickets 1, 2 are sequential and block everything. Tickets 3, 4, 5 form a daemon-side cluster (3 blocks 5; 4 and 5 can run in parallel after 3). Ticket 6 unblocks 7. Ticket 8 can run in parallel with 6/7 after 4 and 5 land. The Epic's parallelism plan will spell this out.
