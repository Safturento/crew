import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { sql } from 'kysely';
import { claudeProjectDirFor } from 'crew-shared';
import type { DaemonApp } from '../app.js';
import { ConflictError, NotFoundError } from '../errors.js';

/** Poll cadence for the `?follow=1` startup-log tail. */
const STARTUP_LOG_TAIL_INTERVAL_MS = 200;

const RunCommand = z.enum(['run', 'fix-pr', 'finish']);
type RunCommandType = z.infer<typeof RunCommand>;

const RegisterRunBody = z.object({
  key: z.string().min(1),
  projectName: z.string().min(1),
  ticketTitle: z.string(),
  worktreePath: z.string().min(1),
  branch: z.string(),
  sessionId: z.string().min(1),
  command: RunCommand,
  startedAt: z.string().min(1),
  // CREW-233: the materialized per-worktree APP_URL. Optional/nullable so
  // legacy CLIs and non-docker projects (which never materialize one) still
  // register; the upsert COALESCEs null against any existing stored value.
  appUrl: z.string().nullable().optional(),
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
    command: RunCommand,
    sessionId: z.string(),
    startedAt: z.string(),
  }),
});

const CompleteRunBody = z.object({
  exitCode: z.number().int(),
  completedAt: z.string().min(1),
});

const CompleteRunParams = z.object({ runId: z.coerce.number().int().positive() });

const AcknowledgeRunParams = z.object({ key: z.string().min(1) });
const AcknowledgeRunResponse = z.object({ acknowledged: z.number() });

const StartupLogParams = z.object({ key: z.string().min(1) });
// `?follow=1` opts into the SSE tail; any other value (or absence) serves the
// static body. Kept as a permissive string so a bare `?follow` or `?follow=0`
// doesn't 400 — only the explicit `1` switches modes.
const StartupLogQuery = z.object({ follow: z.string().optional() });

/**
 * Run lifecycle endpoints. The CLI calls `POST /api/agents/runs` immediately
 * after spawning claude, then `POST .../runs/:runId/complete` when the
 * awaited claude process exits.
 *
 * Register: upserts the agents row (preserving an existing non-empty
 * ticket_title via `COALESCE(NULLIF(excluded.ticket_title, ''), ...)`),
 * inserts a runs row, and attaches an ingest tail. 409 on duplicate
 * session id, 400 from Zod on invalid bodies.
 *
 * Complete: stamps `completed_at` + `exit_code` and detaches the tail.
 * 404 when the run does not exist; 409 when already completed.
 */
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

      // Session uniqueness check up front for the clean 409 path. Throws a
      // typed error so the central setErrorHandler renders the response —
      // keeps `reply.send` typed strictly to the 201 schema.
      const existing = await db
        .selectFrom('runs')
        .select(['id'])
        .where('session_id', '=', body.sessionId)
        .executeTakeFirst();
      if (existing) {
        throw new ConflictError('session_already_registered', undefined, {
          runId: existing.id,
        });
      }

      // Upsert the agent. Preserve the existing ticket_title when the
      // incoming value is '' (e.g. fix-pr with no PR title yet).
      await db
        .insertInto('agents')
        .values({
          key: body.key,
          project_name: body.projectName,
          ticket_title: body.ticketTitle === '' ? null : body.ticketTitle,
          worktree_path: body.worktreePath,
          branch: body.branch,
          pr_url: null,
          app_url: body.appUrl ?? null,
          created_at: new Date().toISOString(),
        })
        .onConflict((oc) =>
          oc.column('key').doUpdateSet({
            project_name: (eb) => eb.ref('excluded.project_name'),
            worktree_path: (eb) => eb.ref('excluded.worktree_path'),
            branch: (eb) => eb.ref('excluded.branch'),
            ticket_title: sql`COALESCE(NULLIF(excluded.ticket_title, ''), agents.ticket_title)`,
            // CREW-233: preserve the run's stored APP_URL when a later fix-pr
            // registration omits it (mirrors the ticket_title COALESCE pattern).
            app_url: sql`COALESCE(excluded.app_url, agents.app_url)`,
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

      // CREW-244: a fresh run supersedes any prior runner-failure state for the
      // key — auto-acknowledge an unacknowledged failed-start and clear any
      // lingering `launching` placeholder (this real run replaces it).
      await req.diScope.resolve('runFailureService').onNewRunRegistered(body.key);

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
          command: inserted.command as RunCommandType,
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
      const eventBus = req.diScope.resolve('eventBus');

      const run = await db
        .selectFrom('runs')
        .selectAll()
        .where('id', '=', runId)
        .executeTakeFirst();
      if (!run) {
        throw new NotFoundError('run_not_found', { resource: 'run', id: String(runId) });
      }
      if (run.completed_at !== null) {
        throw new ConflictError('run_already_completed', undefined, { runId });
      }

      await db
        .updateTable('runs')
        .set({ completed_at: completedAt, exit_code: exitCode })
        .where('id', '=', runId)
        .execute();

      ingest.detach(runId);

      // Layer-1 metrics capture (CREW-164). Best-effort: `captureForRun`
      // swallows its own errors, so a metrics failure never blocks the 204.
      await req.diScope.resolve('metricsService').captureForRun(runId);

      // `crew finish` has no transcript tail, so the dashboard's only signal
      // that the agent has finished is this event. Publish unconditionally on
      // ok-exit so dashboards subscribed to the agent invalidate and refetch
      // (CREW-101 / CREW-94 plan task 14).
      if (exitCode === 0) {
        eventBus.publish({
          type: 'run.completed',
          data: { key: run.agent_key, ts: Date.parse(completedAt) },
        });
      }

      // CREW-116: when a `crew finish` run completes cleanly, write the
      // `to_state = 'finished'` row + publish `agent.state_changed` so the
      // Timeline section grouping reflects the transition. The transcript-tail
      // path can't see this because finish does not spawn Claude.
      if (run.command === 'finish' && exitCode === 0) {
        await ingest.recordFinishCompleted(run.agent_key, completedAt);
      }

      // CREW-198: a clean `crew fix-pr` completion closes the cycle by
      // transitioning `running → pr_open`. recordRunCompleted self-guards on
      // the previous state being `running`, so an aborted/never-ran fix-pr is
      // a safe no-op.
      if (run.command === 'fix-pr' && exitCode === 0) {
        await ingest.recordRunCompleted(run.agent_key, runId, completedAt);
      }

      return reply.code(204).send();
    },
  );

  // CREW-244: explicitly acknowledge (dismiss) a key's failed-start rows.
  // Idempotent — re-acknowledging returns `{ acknowledged: 0 }`.
  app.post(
    '/api/runs/:key/acknowledge',
    {
      schema: {
        params: AcknowledgeRunParams,
        response: { 200: AcknowledgeRunResponse },
      },
    },
    async (req) => {
      const acknowledged = await req.diScope
        .resolve('runFailureService')
        .acknowledge(req.params.key);
      return { acknowledged };
    },
  );

  // CREW-249 (T2): serve a run's raw startup console log captured by the CLI
  // runner at `~/.crew/startup/<key>.log` (mounted read-only into the daemon).
  // Static `text/plain` body for an ended run; `text/event-stream` tail of
  // appended lines when `?follow=1` (an in-flight run). 404 when no log exists.
  app.get(
    '/api/runs/:key/startup-log',
    { schema: { params: StartupLogParams, querystring: StartupLogQuery } },
    async (req, reply) => {
      const { startupEventsDir } = req.diScope.resolve('config');
      const logPath = join(startupEventsDir, `${req.params.key}.log`);

      if (req.query.follow !== '1') {
        let body: string;
        try {
          body = await readFile(logPath, 'utf8');
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new NotFoundError('startup_log_not_found', {
              resource: 'startup-log',
              id: req.params.key,
            });
          }
          throw err;
        }
        return reply.type('text/plain; charset=utf-8').send(body);
      }

      // Follow mode: SSE tail. Mirrors the `GET /api/events` hijack pattern —
      // take over the socket, stream the existing body, then watch the file
      // and push appended bytes as `data:` frames until the client disconnects.
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.flushHeaders?.();

      const sendChunk = (text: string): void => {
        const trimmed = text.replace(/\n$/, '');
        if (trimmed === '') return;
        // One SSE event per chunk; each newline becomes its own `data:` line so
        // multi-line appends arrive as a single well-formed frame.
        const frame = trimmed
          .split('\n')
          .map((line) => `data: ${line}`)
          .join('\n');
        reply.raw.write(`${frame}\n\n`);
      };

      let offset = 0;
      try {
        const initial = await readFile(logPath, 'utf8');
        offset = Buffer.byteLength(initial, 'utf8');
        sendChunk(initial);
      } catch (err) {
        // A not-yet-created log is fine in follow mode — the run may still be
        // starting; the watcher picks the file up when it appears.
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }

      let draining = false;
      const emitAppended = async (): Promise<void> => {
        if (draining) return; // a prior tick is still reading — skip overlap.
        draining = true;
        let handle;
        try {
          handle = await open(logPath, 'r');
        } catch {
          draining = false;
          return; // file not present (yet) — try again next tick.
        }
        try {
          const { size } = await handle.stat();
          if (size === offset) return;
          // Truncated/rotated — reset so we don't skip a fresh body.
          if (size < offset) offset = 0;
          const buf = Buffer.alloc(size - offset);
          await handle.read(buf, 0, buf.length, offset);
          offset = size;
          sendChunk(buf.toString('utf8'));
        } finally {
          await handle.close();
          draining = false;
        }
      };

      // Poll for appended bytes. A short interval is deterministic and avoids
      // the watcher-readiness race a single-file FS watch would introduce;
      // startup logs are short-lived and low-volume, so polling is cheap.
      const timer = setInterval(() => void emitAppended(), STARTUP_LOG_TAIL_INTERVAL_MS);

      const cleanup = (): void => {
        clearInterval(timer);
        if (!reply.raw.writableEnded) reply.raw.end();
      };
      req.raw.on('close', cleanup);
    },
  );
}
