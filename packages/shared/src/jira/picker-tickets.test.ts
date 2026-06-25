import { describe, it, expect } from 'vitest';
import { pickerTicketSchema, projectTicketsResponseSchema } from './picker-tickets.js';

describe('pickerTicketSchema', () => {
  it('requires interactive on a picker ticket', () => {
    const base = {
      key: 'CREW-1',
      summary: 's',
      priority: null,
      runnable: true,
      blockedBy: [],
      hasActiveAgent: false,
    };
    expect(pickerTicketSchema.safeParse(base).success).toBe(false); // interactive missing
    expect(pickerTicketSchema.safeParse({ ...base, interactive: true }).success).toBe(true);
  });
});

describe('projectTicketsResponseSchema', () => {
  it('accepts an available payload with grouped tickets', () => {
    const parsed = projectTicketsResponseSchema.parse({
      available: true,
      groups: [
        {
          epicKey: 'CREW-100',
          epicSummary: 'Epic A',
          tickets: [
            {
              key: 'CREW-101',
              summary: 'Do thing',
              priority: 'High',
              runnable: true,
              blockedBy: [],
              hasActiveAgent: false,
              interactive: false,
            },
          ],
        },
      ],
    });
    expect(parsed.available).toBe(true);
  });

  it('accepts a degraded payload', () => {
    const parsed = projectTicketsResponseSchema.parse({
      available: false,
      reason: 'no_credentials',
    });
    expect(parsed).toEqual({ available: false, reason: 'no_credentials' });
  });

  it('rejects an unknown degraded reason', () => {
    expect(() =>
      projectTicketsResponseSchema.parse({ available: false, reason: 'nope' }),
    ).toThrow();
  });
});
