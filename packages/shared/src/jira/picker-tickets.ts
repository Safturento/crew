import { z } from 'zod';

/** A single candidate ticket as the New Run picker renders it. */
export const pickerTicketSchema = z.object({
  key: z.string(),
  summary: z.string(),
  priority: z.string().nullable(),
  /** false → blocked by at least one unfinished dependency (see blockedBy). */
  runnable: z.boolean(),
  blockedBy: z.array(z.object({ key: z.string(), summary: z.string() })),
  /** true → a non-terminal agent already exists for this ticket. */
  hasActiveAgent: z.boolean(),
  /** true → carries the `interactive` Jira label; must be driven live, not via `crew run`. */
  interactive: z.boolean(),
});

/** Tickets grouped under their parent Epic; epicKey null → "Ungrouped". */
export const ticketGroupSchema = z.object({
  epicKey: z.string().nullable(),
  epicSummary: z.string().nullable(),
  tickets: z.array(pickerTicketSchema),
});

/**
 * Discriminated on `available`: a degraded list (no daemon Jira creds, or
 * Jira unreachable) is a 200 with `available: false`, not a server error.
 */
export const projectTicketsResponseSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(true), groups: z.array(ticketGroupSchema) }),
  z.object({ available: z.literal(false), reason: z.enum(['no_credentials', 'jira_unreachable']) }),
]);

export type PickerTicket = z.infer<typeof pickerTicketSchema>;
export type TicketGroup = z.infer<typeof ticketGroupSchema>;
export type ProjectTicketsResponse = z.infer<typeof projectTicketsResponseSchema>;
