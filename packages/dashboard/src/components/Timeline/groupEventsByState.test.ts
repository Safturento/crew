import { describe, it, expect } from 'vitest';

import type { StateTransition, TranscriptEvent } from '../../data/types.js';
import { groupEventsByState } from './groupEventsByState.js';

function evt(ms: number): TranscriptEvent {
  return {
    type: 'assistant',
    uuid: `u-${ms}`,
    timestamp: new Date(ms).toISOString(),
    message: { role: 'assistant', content: [], usage: { output_tokens: 0 } },
  } as unknown as TranscriptEvent;
}

describe('groupEventsByState', () => {
  it('returns a single section using fallbackState when transitions is empty', () => {
    const events: TranscriptEvent[] = [evt(1000), evt(2000)];
    const sections = groupEventsByState(events, [], 'running');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ state: 'running', startedAt: 1000, endedAt: null });
    expect(sections[0].events).toEqual(events);
  });

  it('returns a single section anchored at Date.now() when both events and transitions are empty', () => {
    const before = Date.now();
    const sections = groupEventsByState([], [], 'idle');
    const after = Date.now();
    expect(sections).toHaveLength(1);
    expect(sections[0].state).toBe('idle');
    expect(sections[0].endedAt).toBeNull();
    expect(sections[0].events).toEqual([]);
    expect(sections[0].startedAt).toBeGreaterThanOrEqual(before);
    expect(sections[0].startedAt).toBeLessThanOrEqual(after);
  });

  it('groups events into sections by transition timestamps, in chronological order', () => {
    const transitions: StateTransition[] = [
      { from: null, to: 'init', ts: 0 },
      { from: 'init', to: 'running', ts: 1000 },
      { from: 'running', to: 'waiting', ts: 5000 },
    ];
    const events: TranscriptEvent[] = [evt(500), evt(1500), evt(2500), evt(6000)];
    const sections = groupEventsByState(events, transitions, 'waiting');
    expect(sections.map((s) => s.state)).toEqual(['initializing', 'running', 'waiting']);
    expect(sections[0].events.map((e) => Date.parse(e.timestamp))).toEqual([500]);
    expect(sections[1].events.map((e) => Date.parse(e.timestamp))).toEqual([1500, 2500]);
    expect(sections[2].events.map((e) => Date.parse(e.timestamp))).toEqual([6000]);
  });

  it('marks the trailing (active) section endedAt=null', () => {
    const transitions: StateTransition[] = [{ from: null, to: 'running', ts: 0 }];
    const sections = groupEventsByState([], transitions, 'running');
    expect(sections[0].endedAt).toBeNull();
  });

  it("marks closed sections with the next transition's ts as endedAt", () => {
    const transitions: StateTransition[] = [
      { from: null, to: 'init', ts: 0 },
      { from: 'init', to: 'running', ts: 1000 },
    ];
    const sections = groupEventsByState([], transitions, 'running');
    expect(sections[0]).toMatchObject({ state: 'initializing', startedAt: 0, endedAt: 1000 });
    expect(sections[1]).toMatchObject({ state: 'running', startedAt: 1000, endedAt: null });
  });

  it('folds events that precede the first transition into the first section', () => {
    const transitions: StateTransition[] = [
      { from: null, to: 'init', ts: 1000 },
      { from: 'init', to: 'running', ts: 2000 },
    ];
    const events: TranscriptEvent[] = [evt(500), evt(1500)];
    const sections = groupEventsByState(events, transitions, 'running');
    expect(sections[0].events.map((e) => Date.parse(e.timestamp))).toEqual([500, 1500]);
    expect(sections[1].events).toEqual([]);
  });

  it('handles out-of-order transitions by sorting on ts', () => {
    const transitions: StateTransition[] = [
      { from: 'init', to: 'running', ts: 1000 },
      { from: null, to: 'init', ts: 0 },
    ];
    const sections = groupEventsByState([], transitions, 'running');
    expect(sections.map((s) => s.state)).toEqual(['initializing', 'running']);
    expect(sections[0]).toMatchObject({ startedAt: 0, endedAt: 1000 });
    expect(sections[1]).toMatchObject({ startedAt: 1000, endedAt: null });
  });
});
