import '@testing-library/jest-dom/vitest';

// jsdom doesn't ship an EventSource implementation. The dashboard's
// `eventStream.ts` constructs a singleton at module load time, so any
// test file that transitively imports it would otherwise throw
// `EventSource is not defined`. Register a no-op stub here; tests that
// need to drive SSE events install their own (e.g. eventStream.test.ts).
if (typeof globalThis.EventSource === 'undefined') {
  class NoopEventSource {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    readonly url: string;
    readonly readyState = 0;
    readonly withCredentials = false;
    onopen: ((e: Event) => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    constructor(url: string) {
      this.url = url;
    }
    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean {
      return false;
    }
    close(): void {}
  }
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
    NoopEventSource as unknown as typeof EventSource;
}

// jsdom doesn't ship ResizeObserver. Components that observe layout
// (e.g. Timeline's MinimapStripe via useSectionHeights) need it to be
// callable; tests that drive resize behaviour install their own.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class NoopResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    NoopResizeObserver as unknown as typeof ResizeObserver;
}

// jsdom doesn't ship IntersectionObserver either. AgentBody observes a
// sentinel to toggle the condensed header; tests that assert that behavior
// install their own controllable mock via vi.stubGlobal.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class NoopIntersectionObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (
    globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }
  ).IntersectionObserver = NoopIntersectionObserver as unknown as typeof IntersectionObserver;
}
