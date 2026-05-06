import { describe, expect, it } from 'vitest';
import { EventBus, type SseEvent } from './EventBus.js';

describe('EventBus', () => {
  it('publishes to subscribers and assigns each event a unique id', () => {
    const bus = new EventBus({ bufferSize: 10 });
    const seen: SseEvent[] = [];
    bus.subscribe({ onEvent: (e) => seen.push(e) });

    const a = bus.publish({ type: 'tool_calls.changed', data: { key: 'KAN-1' } });
    const b = bus.publish({ type: 'tool_calls.changed', data: { key: 'KAN-2' } });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ type: 'tool_calls.changed', id: a.id });
    expect(seen[1]).toMatchObject({ type: 'tool_calls.changed', id: b.id });
    expect(a.id).not.toBe(b.id);
  });

  it('does not deliver buffered events to a fresh subscriber', () => {
    const bus = new EventBus({ bufferSize: 10 });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'A' } });

    const seen: SseEvent[] = [];
    bus.subscribe({ onEvent: (e) => seen.push(e) });

    expect(seen).toEqual([]);
  });

  it('replays only events strictly after lastEventId', () => {
    const bus = new EventBus({ bufferSize: 10 });
    const e1 = bus.publish({ type: 'tool_calls.changed', data: { key: 'A' } });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'B' } });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'C' } });

    const seen: SseEvent[] = [];
    bus.subscribe({ lastEventId: e1.id, onEvent: (e) => seen.push(e) });

    const keys = seen
      .filter(
        (e): e is SseEvent & { type: 'tool_calls.changed' } => e.type === 'tool_calls.changed',
      )
      .map((e) => e.data.key);
    expect(keys).toEqual(['B', 'C']);
  });

  it('emits a single cache.miss event when lastEventId has been evicted', () => {
    const bus = new EventBus({ bufferSize: 2 });
    const stale = bus.publish({ type: 'tool_calls.changed', data: { key: 'A' } });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'B' } });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'C' } });

    const seen: SseEvent[] = [];
    bus.subscribe({ lastEventId: stale.id, onEvent: (e) => seen.push(e) });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'cache.miss' });
  });

  it('cache.miss precedes any subsequent live events', () => {
    const bus = new EventBus({ bufferSize: 2 });
    const stale = bus.publish({ type: 'tool_calls.changed', data: { key: 'A' } });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'B' } });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'C' } });

    const seen: SseEvent[] = [];
    bus.subscribe({ lastEventId: stale.id, onEvent: (e) => seen.push(e) });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'D' } });

    expect(seen.map((e) => e.type)).toEqual(['cache.miss', 'tool_calls.changed']);
  });

  it('evicts the oldest event once the buffer exceeds its cap', () => {
    const bus = new EventBus({ bufferSize: 2 });
    const e1 = bus.publish({ type: 'tool_calls.changed', data: { key: 'A' } });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'B' } });
    bus.publish({ type: 'tool_calls.changed', data: { key: 'C' } });

    // e1 should now be evicted: a subscriber pinned to e1 falls back to cache.miss.
    const seen: SseEvent[] = [];
    bus.subscribe({ lastEventId: e1.id, onEvent: (e) => seen.push(e) });
    expect(seen[0]).toMatchObject({ type: 'cache.miss' });
  });

  it('returns an unsubscribe function that stops further deliveries', () => {
    const bus = new EventBus({ bufferSize: 10 });
    const seen: SseEvent[] = [];
    const unsubscribe = bus.subscribe({ onEvent: (e) => seen.push(e) });

    bus.publish({ type: 'tool_calls.changed', data: { key: 'A' } });
    unsubscribe();
    bus.publish({ type: 'tool_calls.changed', data: { key: 'B' } });

    expect(seen.map((e) => (e.type === 'tool_calls.changed' ? e.data.key : null))).toEqual(['A']);
  });

  it('replays an empty buffer cleanly when lastEventId is unknown but buffer is empty', () => {
    const bus = new EventBus({ bufferSize: 10 });

    const seen: SseEvent[] = [];
    bus.subscribe({ lastEventId: 'never-existed', onEvent: (e) => seen.push(e) });

    // No live events yet; an unknown id against an empty buffer should still
    // surface cache.miss so the client knows it needs a refetch.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'cache.miss' });
  });
});
