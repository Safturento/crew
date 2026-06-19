/**
 * Singleton EventSource wrapper. Connects to the daemon's `/api/events`
 * SSE firehose, dispatches typed events to subscribers, and reconnects
 * with exponential backoff (cap 30s) using `?last_event_id=` for replay
 * — browser EventSource cannot set headers, so the daemon route accepts
 * the id as either a header or a query param (see daemon
 * `routes/events.ts`).
 *
 * `cache.miss` is a synthetic event the daemon emits when the client's
 * last-seen id has fallen out of the bus's ring buffer. Subscribers
 * register via `on('cache.miss', …)` — `main.tsx` wires the QueryClient
 * here at app entry to dodge a circular import with the singleton.
 *
 * Browser-only: the singleton constructs an `EventSource` at module
 * load. Vitest installs a no-op polyfill in `src/test/setup.ts`.
 */

type Handler = (data: unknown) => void;

const EVENT_NAMES = [
  'agent.state_changed',
  'tool_calls.changed',
  'run.completed',
  // CREW-217: action-queue + runner-health pings drive the dashboard
  // action layer (toasts on launch failure, the runner-aware degradation).
  'action.changed',
  'runner.status_changed',
  // CREW-242/CREW-245: the live-process snapshot rides a dedicated event
  // (NOT status_changed, which fires only on online/offline edges) so the
  // Runner page's process list updates each heartbeat cycle.
  'runner.snapshot_changed',
  // CREW-220: pings the drawer's finish-step checklist to refetch as each
  // `crew finish` step streams in.
  'finish_step.changed',
  'cache.miss',
] as const;

const INITIAL_RETRY_MS = 500;
const MAX_RETRY_MS = 30_000;

export class CrewEventStream {
  private readonly handlers = new Map<string, Set<Handler>>();
  private lastEventId: string | undefined;
  private retryMs = INITIAL_RETRY_MS;

  constructor(private readonly url: string) {
    this.connect();
  }

  on(event: string, fn: Handler): () => void {
    let bucket = this.handlers.get(event);
    if (!bucket) {
      bucket = new Set();
      this.handlers.set(event, bucket);
    }
    bucket.add(fn);
    const own = bucket;
    return () => {
      own.delete(fn);
    };
  }

  /**
   * Attaches `window.__crewTestInjectEvent(name, data)` so Playwright
   * specs can fan synthetic events through the same dispatcher real SSE
   * messages use — without standing up a real `EventSource`. The shipped
   * bundle leaves this off; entry-point wiring (`main.tsx`) only calls it
   * under `import.meta.env.DEV`.
   */
  exposeTestInjector(): void {
    (window as unknown as Record<string, unknown>).__crewTestInjectEvent = (
      name: string,
      data: unknown,
    ): void => {
      this.handlers.get(name)?.forEach((fn) => fn(data));
    };
  }

  private connect(): void {
    const url = this.lastEventId
      ? `${this.url}?last_event_id=${encodeURIComponent(this.lastEventId)}`
      : this.url;

    const es = new EventSource(url);

    for (const name of EVENT_NAMES) {
      es.addEventListener(name, (e: MessageEvent) => {
        if (e.lastEventId) this.lastEventId = e.lastEventId;
        const data = JSON.parse(e.data) as unknown;
        this.handlers.get(name)?.forEach((fn) => fn(data));
      });
    }

    es.onopen = () => {
      this.retryMs = INITIAL_RETRY_MS;
    };

    es.onerror = () => {
      es.close();
      const delay = this.retryMs;
      this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
      setTimeout(() => this.connect(), delay);
    };
  }
}

/**
 * Module-level singleton wired to the same-origin `/api/events` route
 * (vite proxies `/api/*` to the daemon in dev; same-origin in prod).
 */
export const eventStream = new CrewEventStream('/api/events');
