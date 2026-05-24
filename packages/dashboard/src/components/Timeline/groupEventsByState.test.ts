import { describe, it, expect } from 'vitest';

import type { StateTransition, TranscriptEvent, TransitionState } from '../../data/types.js';
import { groupEventsByState } from './groupEventsByState.js';

function evt(ms: number): TranscriptEvent {
  return {
    type: 'assistant',
    uuid: `u-${ms}`,
    timestamp: new Date(ms).toISOString(),
    message: { role: 'assistant', content: [], usage: { output_tokens: 0 } },
  } as unknown as TranscriptEvent;
}

function evtIso(iso: string): TranscriptEvent {
  return evt(Date.parse(iso));
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
    // N transitions yield N+1 sections; the leading one is the initial state
    // (from === null falls back to 'init' → 'initializing'), zero-width here.
    expect(sections.map((s) => s.state)).toEqual([
      'initializing',
      'initializing',
      'running',
      'waiting',
    ]);
    expect(sections[0]!.events).toEqual([]);
    expect(sections[1]!.events.map((e) => Date.parse(e.timestamp ?? ''))).toEqual([500]);
    expect(sections[2]!.events.map((e) => Date.parse(e.timestamp ?? ''))).toEqual([1500, 2500]);
    expect(sections[3]!.events.map((e) => Date.parse(e.timestamp ?? ''))).toEqual([6000]);
  });

  it('marks the trailing (active) section endedAt=null', () => {
    const transitions: StateTransition[] = [{ from: null, to: 'running', ts: 0 }];
    const sections = groupEventsByState([], transitions, 'running');
    // sections[0] is the prepended leading section; sections[1] is the running transition.
    expect(sections.at(-1)?.endedAt).toBeNull();
  });

  it("marks closed sections with the next transition's ts as endedAt", () => {
    const transitions: StateTransition[] = [
      { from: null, to: 'init', ts: 0 },
      { from: 'init', to: 'running', ts: 1000 },
    ];
    const sections = groupEventsByState([], transitions, 'running');
    // sections[0] is the leading initial-state section; the transition-derived
    // sections shift to indices 1 and 2.
    expect(sections[1]).toMatchObject({ state: 'initializing', startedAt: 0, endedAt: 1000 });
    expect(sections[2]).toMatchObject({ state: 'running', startedAt: 1000, endedAt: null });
  });

  it('attributes events that precede the first transition to the leading section', () => {
    const transitions: StateTransition[] = [
      { from: null, to: 'init', ts: 1000 },
      { from: 'init', to: 'running', ts: 2000 },
    ];
    const events: TranscriptEvent[] = [evt(500), evt(1500)];
    const sections = groupEventsByState(events, transitions, 'running');
    // Pre-transition evt(500) lands in the leading section; evt(1500) belongs
    // to the 'init' section instead of being folded forward.
    expect(sections[0]!.events.map((e) => Date.parse(e.timestamp ?? ''))).toEqual([500]);
    expect(sections[1]!.events.map((e) => Date.parse(e.timestamp ?? ''))).toEqual([1500]);
    expect(sections[2]!.events).toEqual([]);
  });

  it('handles out-of-order transitions by sorting on ts', () => {
    const transitions: StateTransition[] = [
      { from: 'init', to: 'running', ts: 1000 },
      { from: null, to: 'init', ts: 0 },
    ];
    const sections = groupEventsByState([], transitions, 'running');
    expect(sections.map((s) => s.state)).toEqual(['initializing', 'initializing', 'running']);
    expect(sections[0]).toMatchObject({ startedAt: 0, endedAt: 0 });
    expect(sections[1]).toMatchObject({ startedAt: 0, endedAt: 1000 });
    expect(sections[2]).toMatchObject({ startedAt: 1000, endedAt: null });
  });

  it('prepends a leading section for the initial state when transitions exist', () => {
    const events: TranscriptEvent[] = [
      evtIso('2026-05-23T10:00:00Z'), // before first transition (initializing)
      evtIso('2026-05-23T10:05:00Z'), // after first transition (running)
    ];
    const transitions: StateTransition[] = [
      { from: 'init', to: 'running', ts: Date.parse('2026-05-23T10:03:00Z') },
    ];
    const sections = groupEventsByState(events, transitions, 'running');
    expect(sections).toHaveLength(2);
    expect(sections[0].state).toBe('initializing');
    expect(sections[0].events).toHaveLength(1);
    expect(sections[0].events[0]).toBe(events[0]);
    expect(sections[1].state).toBe('running');
    expect(sections[1].events).toHaveLength(1);
  });

  it('leading section uses transitions[0].from when present', () => {
    const transitions: StateTransition[] = [{ from: 'idle', to: 'running', ts: 1000 }];
    const sections = groupEventsByState([], transitions, 'running');
    expect(sections[0].state).toBe('idle');
  });

  it('leading section falls back to "initializing" when transitions[0].from is null', () => {
    const transitions: StateTransition[] = [
      { from: null as unknown as TransitionState, to: 'running', ts: 1000 },
    ];
    const sections = groupEventsByState([], transitions, 'running');
    expect(sections[0].state).toBe('initializing');
  });

  it('leading section is rendered even with zero events in the initial period', () => {
    const events: TranscriptEvent[] = [
      evtIso('2026-05-23T10:10:00Z'), // all events post-transition
    ];
    const transitions: StateTransition[] = [
      { from: 'init', to: 'running', ts: Date.parse('2026-05-23T10:05:00Z') },
    ];
    const sections = groupEventsByState(events, transitions, 'running');
    expect(sections).toHaveLength(2);
    expect(sections[0].state).toBe('initializing');
    expect(sections[0].events).toHaveLength(0);
  });

  it('leading section startedAt uses earliest event ts when available', () => {
    const events: TranscriptEvent[] = [evtIso('2026-05-23T10:00:00Z')];
    const transitions: StateTransition[] = [
      { from: 'init', to: 'running', ts: Date.parse('2026-05-23T10:05:00Z') },
    ];
    const [leading] = groupEventsByState(events, transitions, 'running');
    expect(leading.startedAt).toBe(Date.parse('2026-05-23T10:00:00Z'));
  });

  it('leading section startedAt collapses to transition.ts when no events predate it', () => {
    const events: TranscriptEvent[] = [evtIso('2026-05-23T10:10:00Z')];
    const transitions: StateTransition[] = [
      { from: 'init', to: 'running', ts: Date.parse('2026-05-23T10:05:00Z') },
    ];
    const [leading] = groupEventsByState(events, transitions, 'running');
    expect(leading.startedAt).toBe(Date.parse('2026-05-23T10:05:00Z'));
  });
});
