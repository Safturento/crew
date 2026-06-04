import { describe, expect, it } from 'vitest';
import { EventBus, type SseEvent } from './EventBus.js';
import { RunnerStatusService } from './RunnerStatusService.js';

/** Collect every runner.status_changed event the bus publishes. */
function collectStatusEvents(bus: EventBus): Array<{ online: boolean; lastSeen: number | null }> {
  const seen: Array<{ online: boolean; lastSeen: number | null }> = [];
  bus.subscribe({
    onEvent: (e: SseEvent) => {
      if (e.type === 'runner.status_changed') seen.push(e.data);
    },
  });
  return seen;
}

/** A hand-cranked clock so staleness/edge behavior is deterministic. */
function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

describe('RunnerStatusService', () => {
  it('emits runner.status_changed{online:true} exactly once on the rising edge', () => {
    const bus = new EventBus();
    const events = collectStatusEvents(bus);
    const clock = fakeClock();
    const svc = new RunnerStatusService({ eventBus: bus, staleMs: 15_000, now: clock.now });

    svc.heartbeat();
    svc.heartbeat(); // still online — no second edge

    expect(events).toEqual([{ online: true, lastSeen: 1_000_000 }]);
    expect(svc.isOnline()).toBe(true);
  });

  it('reports online while within the staleness threshold', () => {
    const bus = new EventBus();
    const clock = fakeClock();
    const svc = new RunnerStatusService({ eventBus: bus, staleMs: 15_000, now: clock.now });

    svc.heartbeat();
    clock.advance(14_999);
    expect(svc.isOnline()).toBe(true);

    clock.advance(2);
    expect(svc.isOnline()).toBe(false);
  });

  it('emits the falling edge once when a heartbeat goes stale', () => {
    const bus = new EventBus();
    const events = collectStatusEvents(bus);
    const clock = fakeClock();
    const svc = new RunnerStatusService({ eventBus: bus, staleMs: 15_000, now: clock.now });

    svc.heartbeat();
    clock.advance(15_001);
    svc.checkStale();
    svc.checkStale(); // already offline — no second edge

    expect(events).toEqual([
      { online: true, lastSeen: 1_000_000 },
      { online: false, lastSeen: 1_000_000 },
    ]);
    expect(svc.isOnline()).toBe(false);
  });

  it('re-emits the rising edge after going offline then heartbeating again', () => {
    const bus = new EventBus();
    const events = collectStatusEvents(bus);
    const clock = fakeClock();
    const svc = new RunnerStatusService({ eventBus: bus, staleMs: 15_000, now: clock.now });

    svc.heartbeat();
    clock.advance(20_000);
    svc.checkStale(); // falling edge
    svc.heartbeat(); // rising edge again

    expect(events.map((e) => e.online)).toEqual([true, false, true]);
    expect(events[2].lastSeen).toBe(1_020_000);
  });

  it('starts offline with a null lastSeen and emits nothing until the first heartbeat', () => {
    const bus = new EventBus();
    const events = collectStatusEvents(bus);
    const clock = fakeClock();
    const svc = new RunnerStatusService({ eventBus: bus, staleMs: 15_000, now: clock.now });

    expect(svc.isOnline()).toBe(false);
    expect(svc.status()).toEqual({ online: false, lastSeen: null });
    svc.checkStale(); // no heartbeat yet — nothing to fall from
    expect(events).toEqual([]);
  });
});
