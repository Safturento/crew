import { z } from 'zod';

/** Concrete lifecycle facts producers append to ~/.crew/state-events/<key>.jsonl. */
export const STATE_EVENT_KINDS = [
  'run_started',
  'pr_created',
  'fixpr_started',
  'fixpr_exited',
  'run_exited',
  'run_paused',
  'finish_completed',
] as const;
export type StateEventKind = (typeof STATE_EVENT_KINDS)[number];

export const STATE_EVENT_SOURCES = [
  'cli-run',
  'cli-fixpr',
  'cli-finish',
  'runner-exit',
  'hook-pr-create',
] as const;
export type EventSource = (typeof STATE_EVENT_SOURCES)[number];

/**
 * One concrete state-lifecycle fact. The daemon reduces (currentState, event)
 * → nextState; producers never assert the target state. `eventId` is a
 * client-generated uuid the daemon dedups on (exactly-once across replays).
 * `exitCode` is meaningful only on `*_exited`; `prUrl` only on `pr_created`.
 */
export const stateEventSchema = z.object({
  eventId: z.string().min(1),
  key: z.string().min(1),
  event: z.enum(STATE_EVENT_KINDS),
  ts: z.string(),
  source: z.enum(STATE_EVENT_SOURCES),
  prUrl: z.string().optional(),
  runId: z.number().optional(),
  exitCode: z.number().nullable().optional(),
});

export type StateEvent = z.infer<typeof stateEventSchema>;
