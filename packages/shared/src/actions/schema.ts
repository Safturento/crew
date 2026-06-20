import { z } from 'zod';
import { FINISH_STEP_STATUSES } from './types.js';

/**
 * Wire schema for `POST /api/actions`. Discriminated on `kind` so each
 * verb validates its own payload — notably `fix_pr` requires a non-empty
 * review `comment`, while `run` and `finish` do not.
 */
export const enqueueActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('run'), ticketKey: z.string().min(1), project: z.string().min(1) }),
  z.object({
    kind: z.literal('fix_pr'),
    ticketKey: z.string().min(1),
    project: z.string().min(1),
    comment: z.string().min(1),
  }),
  z.object({ kind: z.literal('finish'), ticketKey: z.string().min(1), project: z.string().min(1) }),
  z.object({ kind: z.literal('resume'), ticketKey: z.string().min(1), project: z.string().min(1) }),
]);

export type EnqueueAction = z.infer<typeof enqueueActionSchema>;

/**
 * Wire schema for `POST /api/agents/:key/finish-step`. The agent `key`
 * comes from the route param, so it is not part of the body.
 */
export const finishStepSchema = z.object({
  index: z.number().int().nonnegative(),
  label: z.string().min(1),
  status: z.enum(FINISH_STEP_STATUSES),
  detail: z.string().optional(),
  ts: z.number(),
});

export type FinishStepInput = z.infer<typeof finishStepSchema>;
