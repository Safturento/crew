import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  RUNNER_COMMAND_KINDS,
  RUNNER_COMMAND_STATUSES,
  enqueueRunnerCommandSchema,
  liveProcessSchema,
  runnerCommandPayloadSchema,
  runnerPageSchema,
  runnerSnapshotSchema,
} from 'crew-shared';
import type { DaemonApp } from '../app.js';

const RunnerStatusResponseSchema = z.object({
  online: z.boolean(),
  lastSeen: z.number().nullable(),
  processes: z.array(liveProcessSchema),
});

/**
 * Heartbeat body. Optional in full — the legacy runner pings with no body
 * (online edge only), while the snapshot-aware runner carries its current
 * live-process snapshot so the daemon can mirror it. `.nullish()` because a
 * bodyless POST reaches the validator as `null`, not `undefined`.
 */
const HeartbeatBodySchema = z.object({ snapshot: runnerSnapshotSchema.optional() }).nullish();

/** Wire shape of a `RunnerCommand` — the daemon's response on enqueue/claim. */
const RunnerCommandSchema = z.object({
  id: z.number(),
  agentKey: z.string().nullable(),
  kind: z.enum(RUNNER_COMMAND_KINDS),
  payload: runnerCommandPayloadSchema.nullable(),
  status: z.enum(RUNNER_COMMAND_STATUSES),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CommandResultParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const CommandResultBodySchema = z.object({
  status: z.enum(['applied', 'failed']),
  error: z.string().optional(),
});

const RunCommandSchema = z.enum(['run', 'fix-pr', 'finish']);

/** The `RunFailure` diagnosis (mirrors the `crew-shared` shape). */
const RunFailureSchema = z.object({
  check: z.string().min(1),
  headline: z.string().min(1),
  remediation: z.string(),
  output: z.string(),
});

const LaunchingBodySchema = z.object({
  key: z.string().min(1),
  projectName: z.string().min(1),
  command: RunCommandSchema,
  worktreePath: z.string().min(1),
  branch: z.string(),
  startedAt: z.string().min(1),
  ticketTitle: z.string().optional(),
  appUrl: z.string().nullable().optional(),
});

/**
 * CREW-307 — the direct-CLI birth body. Mirrors the CREW-244 launching body
 * minus the run-specific fields (`command`/`startedAt`), since this births only
 * the agent row + an `init` transition, not a `runs` row.
 */
const InitializingBodySchema = z.object({
  key: z.string().min(1),
  projectName: z.string().min(1),
  worktreePath: z.string().min(1),
  branch: z.string(),
  appUrl: z.string().nullable().optional(),
});

const FailedStartBodySchema = z.object({
  key: z.string().min(1),
  projectName: z.string().min(1),
  command: RunCommandSchema,
  failure: RunFailureSchema,
  // Optional — only used on the insert-fresh path (no launching row).
  worktreePath: z.string().optional(),
  branch: z.string().optional(),
  ticketTitle: z.string().optional(),
  startedAt: z.string().optional(),
});

const RunIdResponseSchema = z.object({ runId: z.number() });

const LogsQuerySchema = z.object({
  // Number of trailing lines to return. Coerced (querystrings are strings),
  // capped so a malicious `?tail=1e9` can't force the daemon to materialize
  // the whole file's lines into one response.
  tail: z.coerce.number().int().positive().max(2000).default(200),
});

const LogsResponseSchema = z.object({
  lines: z.array(z.string()),
});

const SupervisorLogQuerySchema = z.object({
  tail: z.coerce.number().int().positive().max(2000).default(200),
  // `?raw=1` bypasses the management filter and serves the full tail.
  raw: z.string().optional(),
});

/**
 * Management lines the supervisor drawer cares about — the supervisor's own
 * lifecycle (`runner started|stopped|already running|failed to start ...`),
 * worker respawn (`worker exited N; respawning`), stale-pidfile recovery
 * (`stale pidfile ...` / `removed stale pidfile ...`), and dead-process
 * reaping (`reaped N dead process(es) ...`). Matched against the actual
 * `deps.log(...)` strings the runner emits in `packages/cli/src/lib/runner/
 * {supervisor,loop}.ts`. `runner.log` interleaves these with per-action /
 * per-command noise (`launched action ...`, `applied command ...`, `poll
 * error ...`, `iteration error ...`) — none of which contain `runner` — that
 * belongs to the queued/recently-ended surfaces, not the supervisor view.
 * (Spec open question: revisit if the runner later emits a structured
 * management-event stream; `?raw=1` serves the unfiltered tail meanwhile.)
 */
const SUPERVISOR_MANAGEMENT_RE = /\b(runner\b|respawn|stale pidfile|worker exited|reap)/i;

/**
 * Read the last `tail` lines of the runner log. Returns `[]` when the file
 * is absent (no runner has ever run on this host) — a missing log is the
 * normal state on a worktree stack, not an error.
 */
async function tailLog(logPath: string, tail: number): Promise<string[]> {
  let content: string;
  try {
    content = await readFile(logPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  // Drop a trailing newline so a well-formed "...\n" file doesn't yield a
  // phantom empty last line.
  const lines = content.replace(/\n$/, '').split('\n');
  if (lines.length === 1 && lines[0] === '') return [];
  return lines.slice(-tail);
}

/**
 * CREW-215 — runner-ops routes.
 *
 * - `POST /api/runner/heartbeat` — the host runner pings this on an
 *   interval; flips online + emits `runner.status_changed` on the rising
 *   edge. An optional `{ snapshot }` body carries the live-process snapshot,
 *   mirrored on the service + emitted as `runner.snapshot_changed`. Returns
 *   the current status (incl. `processes`).
 * - `GET  /api/runner/status`    — current online/offline + lastSeen +
 *   live processes, for the dashboard to seed its SSE-driven runner views.
 * - `GET  /api/runner/logs?tail=N` — tails the mounted `runner.log`.
 * - `POST /api/runner/launching` — CREW-244: pre-register a run as
 *   `launching` *before* preflight, so an init failure has a row to convert.
 * - `POST /api/runner/initializing` — CREW-307: the direct-CLI birth point.
 *   Idempotently upserts the agent row + writes an `init` transition, so a
 *   `crew run` is visible in the grid from config-resolve onward. 204.
 * - `POST /api/runner/failed-start` — CREW-244: record a structured
 *   failed-start (converting the launching placeholder when present).
 * - `POST /api/runner/commands`            — enqueue a reverse-queue control
 *   command (cancel / dequeue / reap / ...). Returns the new `pending` row.
 * - `GET  /api/runner/commands/pending`    — the runner atomically claims the
 *   oldest pending command each cycle (200 with the row, or `null`).
 * - `POST /api/runner/commands/:id/result` — the runner reports the apply
 *   outcome (`applied` / `failed`). 204.
 *
 * The command routes are thin wrappers over `RunnerCommandsService` (CREW-241).
 */
export async function registerRunnerRoutes(app: DaemonApp): Promise<void> {
  app.post(
    '/api/runner/heartbeat',
    { schema: { body: HeartbeatBodySchema, response: { 200: RunnerStatusResponseSchema } } },
    async (req) => {
      const svc = req.diScope.resolve('runnerStatusService');
      svc.heartbeat(req.body?.snapshot);
      return svc.status();
    },
  );

  app.get(
    '/api/runner/status',
    { schema: { response: { 200: RunnerStatusResponseSchema } } },
    async (req) => {
      const svc = req.diScope.resolve('runnerStatusService');
      return svc.status();
    },
  );

  app.post(
    '/api/runner/launching',
    { schema: { body: LaunchingBodySchema, response: { 201: RunIdResponseSchema } } },
    async (req, reply) => {
      const svc = req.diScope.resolve('runFailureService');
      const { runId } = await svc.recordLaunching(req.body);
      return reply.code(201).send({ runId });
    },
  );

  app.post(
    '/api/runner/initializing',
    { schema: { body: InitializingBodySchema } },
    async (req, reply) => {
      const svc = req.diScope.resolve('runFailureService');
      await svc.recordInitializing(req.body);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/runner/failed-start',
    { schema: { body: FailedStartBodySchema, response: { 201: RunIdResponseSchema } } },
    async (req, reply) => {
      const svc = req.diScope.resolve('runFailureService');
      const { runId } = await svc.recordFailedStart(req.body);
      return reply.code(201).send({ runId });
    },
  );

  app.get(
    '/api/runner/logs',
    {
      schema: {
        querystring: LogsQuerySchema,
        response: { 200: LogsResponseSchema },
      },
    },
    async (req) => {
      const { runnerLogDir } = req.diScope.resolve('config');
      const lines = await tailLog(join(runnerLogDir, 'runner.log'), req.query.tail);
      return { lines };
    },
  );

  // CREW-249 (T2): the Runner page's read surface — failed-to-start, queued,
  // and recently-ended lists from the DB. Thin wrapper over RunnerPageService.
  app.get('/api/runner/page', { schema: { response: { 200: runnerPageSchema } } }, async (req) =>
    req.diScope.resolve('runnerPageService').getPage(),
  );

  // CREW-249 (T2): the supervisor drawer's read surface — the management slice
  // of `runner.log` (spawn/respawn/heartbeat/reap), tailed to the last N lines.
  // `?raw=1` serves the unfiltered tail.
  app.get(
    '/api/runner/supervisor-log',
    {
      schema: {
        querystring: SupervisorLogQuerySchema,
        response: { 200: LogsResponseSchema },
      },
    },
    async (req) => {
      const { runnerLogDir } = req.diScope.resolve('config');
      const all = await tailLog(join(runnerLogDir, 'runner.log'), Number.MAX_SAFE_INTEGER);
      const filtered =
        req.query.raw === '1' ? all : all.filter((l) => SUPERVISOR_MANAGEMENT_RE.test(l));
      return { lines: filtered.slice(-req.query.tail) };
    },
  );

  app.post(
    '/api/runner/commands',
    { schema: { body: enqueueRunnerCommandSchema, response: { 201: RunnerCommandSchema } } },
    async (req, reply) => {
      const command = await req.diScope.resolve('runnerCommandsService').enqueue(req.body);
      return reply.code(201).send(command);
    },
  );

  app.get(
    '/api/runner/commands/pending',
    {
      // 200 with the claimed row, or `null` when the queue is empty — a null
      // body keeps the runner client a single `RunnerCommand | null` shape
      // with no status-code branching, mirroring `GET /api/actions/pending`.
      schema: { response: { 200: RunnerCommandSchema.nullable() } },
    },
    async (req, reply) => {
      const command = await req.diScope.resolve('runnerCommandsService').claimPending();
      return reply.code(200).send(command);
    },
  );

  app.post(
    '/api/runner/commands/:id/result',
    { schema: { params: CommandResultParamsSchema, body: CommandResultBodySchema } },
    async (req, reply) => {
      await req.diScope
        .resolve('runnerCommandsService')
        .reportResult(req.params.id, req.body.status, req.body.error);
      return reply.code(204).send();
    },
  );
}
