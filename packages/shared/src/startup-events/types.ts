import { z } from 'zod';
import type { systemStartupPhaseRowSchema } from '../transcripts/schemas.js';

/**
 * The seven CLI startup phases captured by `crew run` / `crew fix-pr`.
 * Order mirrors the dispatch sequence; phases that don't run (e.g. fix-pr
 * skips worktree + npm_install) simply emit no events.
 */
export const STARTUP_PHASE_SUBTYPES = [
  'crew_startup_preflight',
  'crew_startup_worktree',
  'crew_startup_env_spec',
  'crew_startup_npm_install',
  'crew_startup_docker',
  'crew_startup_mcp',
  'crew_startup_claude_spawn',
] as const;

export type StartupPhaseSubtype = (typeof STARTUP_PHASE_SUBTYPES)[number];

export const STARTUP_EVENT_STATUSES = ['started', 'completed', 'failed'] as const;
export type StartupEventStatus = (typeof STARTUP_EVENT_STATUSES)[number];

/**
 * What the CLI writes per phase to `~/.crew/startup/<key>.jsonl`. Two
 * events per phase: `started` before the work, `completed` or `failed`
 * after. `durationMs` and `logPath` are only meaningful on terminal
 * events but are typed as optional throughout for write-side simplicity.
 */
export const startupEventSchema = z.object({
  type: z.literal('system'),
  subtype: z.enum(STARTUP_PHASE_SUBTYPES),
  status: z.enum(STARTUP_EVENT_STATUSES),
  timestamp: z.string(),
  summary: z.string(),
  durationMs: z.number().optional(),
  logPath: z.string().optional(),
});

export type StartupEvent = z.infer<typeof startupEventSchema>;

/**
 * Daemon → frontend wire shape. Built by `mergeStartedAndCompleted` from
 * the started+terminal pair (or just started, while in flight). Renders
 * as a single row per phase in the drawer Timeline; in-flight rows flip
 * to completed/failed via SSE as terminal events arrive.
 *
 * Inferred from `systemStartupPhaseRowSchema` so the `.passthrough()`
 * index signature carries through — that's what lets the type be
 * assignable to `TranscriptEvent`.
 */
export type StartupPhaseRow = z.infer<typeof systemStartupPhaseRowSchema>;
