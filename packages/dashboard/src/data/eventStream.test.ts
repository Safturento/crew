import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CrewEventStream } from './eventStream.js';

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Record<string, Array<(e: MessageEvent) => void>> = {};
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(name: string, fn: (e: MessageEvent) => void): void {
    (this.listeners[name] ||= []).push(fn);
  }

  emit(name: string, data: unknown, lastEventId?: string): void {
    const event = { data: JSON.stringify(data), lastEventId } as unknown as MessageEvent;
    (this.listeners[name] ?? []).forEach((fn) => fn(event));
  }

  close(): void {
    this.closed = true;
  }
}

const originalEventSource = globalThis.EventSource;

beforeEach(() => {
  (globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource;
  MockEventSource.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  if (originalEventSource) {
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
      originalEventSource;
  }
});

describe('CrewEventStream', () => {
  it('dispatches typed events to subscribers keyed on the event name', () => {
    const stream = new CrewEventStream('http://localhost/api/events');
    const seen: unknown[] = [];
    stream.on('agent.state_changed', (e) => seen.push(e));

    MockEventSource.instances[0]!.emit(
      'agent.state_changed',
      { key: 'KAN-1', from: null, to: 'init', ts: 0 },
      'evt-1',
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ key: 'KAN-1', from: null, to: 'init', ts: 0 });
  });

  it('returns an unsubscribe function from on() that detaches the handler', () => {
    const stream = new CrewEventStream('http://localhost/api/events');
    const seen: unknown[] = [];
    const off = stream.on('tool_calls.changed', (e) => seen.push(e));

    MockEventSource.instances[0]!.emit('tool_calls.changed', { key: 'KAN-1' }, 'evt-1');
    off();
    MockEventSource.instances[0]!.emit('tool_calls.changed', { key: 'KAN-1' }, 'evt-2');

    expect(seen).toHaveLength(1);
  });

  it('dispatches cache.miss events to subscribers (the entry point bootstrap.ts uses)', () => {
    const stream = new CrewEventStream('http://localhost/api/events');
    const onCacheMiss = vi.fn();
    stream.on('cache.miss', onCacheMiss);

    MockEventSource.instances[0]!.emit('cache.miss', {}, 'evt-x');

    expect(onCacheMiss).toHaveBeenCalledTimes(1);
  });

  it('reconnects with ?last_event_id= when an event id has been observed', () => {
    new CrewEventStream('http://localhost/api/events');
    MockEventSource.instances[0]!.emit('agent.state_changed', { key: 'A' }, 'evt-7');

    MockEventSource.instances[0]!.onerror?.(new Event('error'));
    vi.advanceTimersByTime(500);

    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1]!.url).toBe(
      'http://localhost/api/events?last_event_id=evt-7',
    );
  });

  it('uses the bare url for the initial connect (no last_event_id known)', () => {
    new CrewEventStream('http://localhost/api/events');
    expect(MockEventSource.instances[0]!.url).toBe('http://localhost/api/events');
  });

  it('applies exponential backoff capped at 30s on consecutive failures', () => {
    new CrewEventStream('http://localhost/api/events');

    const fail = (): void => MockEventSource.instances.at(-1)!.onerror?.(new Event('error'));

    fail(); // schedule retry at 500ms
    vi.advanceTimersByTime(500);
    expect(MockEventSource.instances).toHaveLength(2);

    fail(); // schedule retry at 1000ms
    vi.advanceTimersByTime(1000);
    expect(MockEventSource.instances).toHaveLength(3);

    fail(); // 2000ms
    vi.advanceTimersByTime(2000);
    expect(MockEventSource.instances).toHaveLength(4);

    // Keep failing — eventually the delay should cap at 30s.
    for (let i = 0; i < 10; i++) {
      fail();
      vi.advanceTimersByTime(30_000);
    }
    // After enough failures, advancing 30s should always produce a new connection.
    const before = MockEventSource.instances.length;
    fail();
    vi.advanceTimersByTime(30_000);
    expect(MockEventSource.instances.length).toBe(before + 1);

    // And advancing only 29.999s should NOT (delay is capped at 30s, not lower).
    fail();
    vi.advanceTimersByTime(29_999);
    expect(MockEventSource.instances.length).toBe(before + 1);
    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances.length).toBe(before + 2);
  });

  it('resets the backoff window after a successful open', () => {
    new CrewEventStream('http://localhost/api/events');

    // Push the backoff up.
    MockEventSource.instances[0]!.onerror?.(new Event('error'));
    vi.advanceTimersByTime(500);
    MockEventSource.instances[1]!.onerror?.(new Event('error'));
    vi.advanceTimersByTime(1000);

    // A successful open on the new connection should reset retryMs.
    MockEventSource.instances[2]!.onopen?.(new Event('open'));

    // Next failure schedules at 500ms again, not 2000ms.
    MockEventSource.instances[2]!.onerror?.(new Event('error'));
    vi.advanceTimersByTime(499);
    expect(MockEventSource.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(4);
  });

  it('closes the previous EventSource before reconnecting', () => {
    new CrewEventStream('http://localhost/api/events');
    const first = MockEventSource.instances[0]!;
    first.onerror?.(new Event('error'));
    expect(first.closed).toBe(true);
  });
});
