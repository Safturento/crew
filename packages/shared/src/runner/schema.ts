import { z } from 'zod';
import { LIVE_PROCESS_STATES, RUNNER_COMMAND_KINDS } from './types.js';

/**
 * Wire schema for one tracked agent subprocess inside a runner snapshot.
 * Mirrors the `LiveProcess` interface in `./types.ts`; kept as a zod schema
 * so the daemon can validate the snapshot the runner POSTs on its heartbeat
 * and serialize it back on `GET /api/runner/status`.
 */
export const liveProcessSchema = z.object({
  agentKey: z.string().min(1),
  command: z.enum(['run', 'fix-pr', 'finish']),
  pid: z.number().int(),
  pgid: z.number().int(),
  actionRequestId: z.number().int().nullable(),
  spawnedAt: z.string(),
  state: z.enum(LIVE_PROCESS_STATES),
  project: z.string().min(1),
});

/** Wire schema for the full live-process snapshot pushed on each heartbeat. */
export const runnerSnapshotSchema = z.object({
  processes: z.array(liveProcessSchema),
});

/** Optional per-command payload (steering message for `message`/`resume`). */
export const runnerCommandPayloadSchema = z.object({
  message: z.string().optional(),
});

/**
 * Wire schema for `POST /api/runner/commands` — the operator enqueues a
 * reverse-queue control command. `agentKey` is null for queue-level commands
 * (`dequeue`) that target a pending action rather than a live process;
 * `payload` defaults to null so the common cancel/reap case sends just the
 * kind. Mirrors `enqueueActionSchema`.
 */
export const enqueueRunnerCommandSchema = z.object({
  agentKey: z.string().min(1).nullable(),
  kind: z.enum(RUNNER_COMMAND_KINDS),
  payload: runnerCommandPayloadSchema.nullable().default(null),
});

export type EnqueueRunnerCommand = z.infer<typeof enqueueRunnerCommandSchema>;
