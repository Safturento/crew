/**
 * Singleton EventSource wrapper. Connects to the daemon's `/api/events`
 * SSE firehose, dispatches typed events to subscribers, and reconnects
 * with exponential backoff (cap 30s) using `?last_event_id=` for replay
 * — browser EventSource cannot set headers, so the daemon route accepts
 * the id as either a header or a query param (see daemon
 * `routes/events.ts`).
 *
 * `cache.miss` is a synthetic event the daemon emits when the client's
 * last-seen id has fallen out of the bus's ring buffer; the configured
 * `onCacheMiss` handler should drop local cache and refetch.
 */

type Handler = (data: unknown) => void;

const EVENT_NAMES = [
  'agent.state_changed',
  'tool_calls.changed',
  'run.completed',
  'cache.miss',
] as const;

const INITIAL_RETRY_MS = 500;
const MAX_RETRY_MS = 30_000;

export interface CrewEventStreamOpts {
  onCacheMiss?: () => void;
}

export class CrewEventStream {
  private readonly handlers = new Map<string, Set<Handler>>();
  private lastEventId: string | undefined;
  private retryMs = INITIAL_RETRY_MS;

  constructor(
    private readonly url: string,
    private readonly opts: CrewEventStreamOpts = {},
  ) {
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

  private connect(): void {
    const url = this.lastEventId
      ? `${this.url}?last_event_id=${encodeURIComponent(this.lastEventId)}`
      : this.url;

    const es = new EventSource(url);

    for (const name of EVENT_NAMES) {
      es.addEventListener(name, (e: MessageEvent) => {
        if (e.lastEventId) this.lastEventId = e.lastEventId;
        const data = JSON.parse(e.data) as unknown;
        if (name === 'cache.miss') this.opts.onCacheMiss?.();
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
 * (the dashboard's vite/proxy + daemon both serve under the same prefix).
 *
 * `onCacheMiss` is registered lazily by `bootstrap.ts` at app entry to
 * avoid a circular import with the TanStack `QueryClient`.
 */
export const eventStream = new CrewEventStream('/api/events');
