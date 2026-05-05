import { join } from 'node:path';
import { z } from 'zod';
import { sql } from 'kysely';
import { claudeProjectDirFor } from 'crew-shared';
import type { DaemonApp } from '../app.js';
import { ConflictError, NotFoundError } from '../errors.js';

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

      return reply.code(204).send();
    },
  );
}
