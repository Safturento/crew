import { z } from 'zod';

/**
 * Base envelope stamped on most transcript events. All fields are optional
 * because older fixtures (and sentinel events like `last-prompt`) omit a
 * subset. `uuid` and `parentUuid` form the conversation tree CC threads
 * through the JSONL — preserved on every variant.
 */
export const baseEnvelopeSchema = z
  .object({
    uuid: z.string().optional(),
    parentUuid: z.string().nullable().optional(),
    timestamp: z.string().optional(),
    sessionId: z.string().optional(),
    cwd: z.string().optional(),
    gitBranch: z.string().optional(),
    userType: z.string().optional(),
    entrypoint: z.string().optional(),
    version: z.string().optional(),
    isSidechain: z.boolean().optional(),
    isMeta: z.boolean().optional(),
  })
  .passthrough();

/**
 * Catch-all variant constructed by the parser when the input fails Zod
 * validation. `reason` records why we fell through:
 * - `unknown_top_level` — `type` field is missing or not in the known set.
 * - `unknown_subtype` — `type` is recognized (`system` / `attachment`) but
 *   the nested discriminator is missing or unrecognized.
 * - `zod_failure` — `type` and any nested discriminator are recognized,
 *   but the surrounding shape failed validation.
 */
export const unknownEventSchema = baseEnvelopeSchema.extend({
  type: z.literal('unknown'),
  raw: z.unknown(),
  reason: z.enum(['unknown_top_level', 'unknown_subtype', 'zod_failure']),
});

/**
 * Top-level discriminated union. Concrete variants land in this list as
 * they're added in subsequent steps; the `unknown` variant is the universal
 * fallback the parser constructs when nothing else matches.
 */
export const transcriptEventSchema = z.discriminatedUnion('type', [unknownEventSchema]);

export type TranscriptEvent = z.infer<typeof transcriptEventSchema>;
export type UnknownEvent = z.infer<typeof unknownEventSchema>;
