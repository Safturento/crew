import { z } from 'zod';

/**
 * Server-side contracts for the Runner page's read surface (`GET
 * /api/runner/page`, Epic CREW-249 / T2). These mirror the view shapes the
 * dashboard already renders (`packages/dashboard/src/components/runner/
 * types.ts`) so the daemon and the dashboard agree on the wire. The three
 * lists — failed-to-start, queued, recently-ended — back the three Runner
 * page sections that shipped stubbed in CREW-245.
 *
 * Kept as zod schemas (not just interfaces) so the route can declare them as
 * its `response` shape and validate-on-serialize, matching `liveProcessSchema`.
 */

/** The verb a run/action was launched with. Mirrors the dashboard view types. */
export const RUNNER_COMMAND_NAMES = ['run', 'fix-pr', 'finish', 'resume'] as const;
export type RunnerCommandName = (typeof RUNNER_COMMAND_NAMES)[number];

/** Terminal classification of a recently-ended run, for its history pill. */
export const ENDED_KINDS = ['finished', 'cancelled', 'error', 'failed-start'] as const;
export type EndedKind = (typeof ENDED_KINDS)[number];

/** The structured failed-start diagnosis (mirrors `RunFailure`). */
const runFailureSchema = z.object({
  check: z.string(),
  headline: z.string(),
  remediation: z.string(),
  output: z.string(),
});

/** A run that died during init/preflight — the Failed-to-start attention queue. */
export const failedStartViewSchema = z.object({
  key: z.string(),
  command: z.enum(RUNNER_COMMAND_NAMES),
  project: z.string(),
  failedAt: z.string(), // ISO
  failure: runFailureSchema,
});
export type FailedStartView = z.infer<typeof failedStartViewSchema>;

/** A pending action request not yet spawned — the Queued-actions section. */
export const queuedActionViewSchema = z.object({
  key: z.string(),
  command: z.enum(RUNNER_COMMAND_NAMES),
  project: z.string(),
  queuedAt: z.string(), // ISO
});
export type QueuedActionView = z.infer<typeof queuedActionViewSchema>;

/** A terminal run for the Recently-ended history. */
export const endedRunViewSchema = z.object({
  key: z.string(),
  command: z.enum(RUNNER_COMMAND_NAMES),
  project: z.string(),
  endedAt: z.string(), // ISO
  kind: z.enum(ENDED_KINDS),
  /** finished → PR link target. */
  prUrl: z.string().optional(),
  /** finished → PR number, for the "PR #340" label. */
  prNumber: z.number().optional(),
  /** error / failed-start → the Inspect drawer payload. */
  failure: runFailureSchema.optional(),
});
export type EndedRunView = z.infer<typeof endedRunViewSchema>;

/** The `GET /api/runner/page` response envelope. */
export const runnerPageSchema = z.object({
  failedToStart: z.array(failedStartViewSchema),
  queued: z.array(queuedActionViewSchema),
  recentlyEnded: z.array(endedRunViewSchema),
});
export type RunnerPage = z.infer<typeof runnerPageSchema>;
