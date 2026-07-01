import { describe, it, expect } from 'vitest';
import { stateEventSchema, STATE_EVENT_KINDS } from './index.js';

describe('stateEventSchema', () => {
  it('accepts a minimal run_started event', () => {
    const e = stateEventSchema.parse({
      eventId: 'abc',
      key: 'CREW-1',
      event: 'run_started',
      ts: '2026-06-18T00:00:00Z',
      source: 'cli-run',
    });
    expect(e.event).toBe('run_started');
    expect(e.prUrl).toBeUndefined();
  });

  it('accepts a pr_created event carrying prUrl + runId', () => {
    const e = stateEventSchema.parse({
      eventId: 'd1',
      key: 'CREW-1',
      event: 'pr_created',
      ts: '2026-06-18T00:00:00Z',
      source: 'hook-pr-create',
      prUrl: 'https://github.com/o/r/pull/5',
      runId: 42,
    });
    expect(e.prUrl).toContain('/pull/5');
  });

  it('rejects an unknown event kind', () => {
    expect(() =>
      stateEventSchema.parse({
        eventId: 'x',
        key: 'CREW-1',
        event: 'nope',
        ts: '2026-06-18T00:00:00Z',
        source: 'cli-run',
      }),
    ).toThrow();
  });

  it('accepts a run_paused event (CREW-273 — the non-terminal pause variant)', () => {
    const e = stateEventSchema.parse({
      eventId: 'p1',
      key: 'CREW-1',
      event: 'run_paused',
      ts: '2026-06-18T00:00:00Z',
      source: 'runner-exit',
    });
    expect(e.event).toBe('run_paused');
  });

  it('accepts a run_orphaned event (CREW-307 — running → orphaned mismatch)', () => {
    const e = stateEventSchema.parse({
      eventId: 'o1',
      key: 'CREW-1',
      event: 'run_orphaned',
      ts: '2026-06-30T00:00:00Z',
      source: 'runner-exit',
    });
    expect(e.event).toBe('run_orphaned');
  });

  it('exposes all eight kinds', () => {
    expect(STATE_EVENT_KINDS).toHaveLength(8);
    expect(STATE_EVENT_KINDS).toContain('run_paused');
    expect(STATE_EVENT_KINDS).toContain('run_orphaned');
  });
});
