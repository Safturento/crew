import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { DaemonApp } from '../app.js';

const RunnerStatusResponseSchema = z.object({
  online: z.boolean(),
  lastSeen: z.number().nullable(),
});

const LogsQuerySchema = z.object({
  // Number of trailing lines to return. Coerced (querystrings are strings),
  // capped so a malicious `?tail=1e9` can't force the daemon to materialize
  // the whole file's lines into one response.
  tail: z.coerce.number().int().positive().max(2000).default(200),
});

const LogsResponseSchema = z.object({
  lines: z.array(z.string()),
});

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
 *   edge. Returns the current status.
 * - `GET  /api/runner/status`    — current online/offline + lastSeen, for
 *   the dashboard to seed its SSE-driven runner chip on mount.
 * - `GET  /api/runner/logs?tail=N` — tails the mounted `runner.log`.
 */
export async function registerRunnerRoutes(app: DaemonApp): Promise<void> {
  app.post(
    '/api/runner/heartbeat',
    { schema: { response: { 200: RunnerStatusResponseSchema } } },
    async (req) => {
      const svc = req.diScope.resolve('runnerStatusService');
      svc.heartbeat();
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
}
