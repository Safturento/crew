import { describe, it, expect } from 'vitest';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { pino, type Logger } from 'pino';
import type { AddressInfo } from 'node:net';
import { buildApp, type DaemonApp } from '../app.js';
import { parseDaemonConfig } from '../config.js';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import type { Kysely } from 'kysely';
import { useTmpDir } from '../test/tmpdir.js';
import type { EventBus, SseEvent } from '../services/EventBus.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir();
const silentLogger: Logger = pino({ level: 'silent' });

interface Harness {
  app: DaemonApp;
  db: Kysely<DaemonDatabase>;
  baseUrl: string;
  eventBus: EventBus;
  close: () => Promise<void>;
}

async function setupApp(): Promise<Harness> {
  const dir = tmp();
  const config = parseDaemonConfig({
    CREW_CONFIG_DIR: dir,
    CREW_DB_FILE: join(dir, 'state.db'),
  });
  const db = createDb(config.dbFile);
  await runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp({ config, logger: silentLogger, db });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  // The route test reaches into the singleton from the cradle so it can
  // publish without going through HTTP — the route is what we're testing,
  // not the publish path.
  const eventBus = app.diContainer.cradle.eventBus;
  return {
    app,
    db,
    baseUrl,
    eventBus,
    close: async () => {
      await app.close();
      await db.destroy();
    },
  };
}

/**
 * Reads SSE frames off a streaming Response until at least `count` complete
 * frames have arrived (delimited by `\n\n`). Returns the parsed events.
 */
async function readFrames(
  response: Response,
  count: number,
  timeoutMs = 1000,
): Promise<SseEvent[]> {
  if (!response.body) throw new Error('response has no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buf = '';
  const start = Date.now();
  try {
    while (events.length < count) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`timed out waiting for ${count} frames; got ${events.length}: ${buf}`);
      }
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        events.push(parseFrame(frame));
        if (events.length >= count) break;
      }
    }
    return events;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function parseFrame(frame: string): SseEvent {
  const out: Record<string, string> = {};
  for (const line of frame.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trimStart();
    out[key] = val;
  }
  if (!out.id || !out.event || !('data' in out)) {
    throw new Error(`malformed SSE frame: ${JSON.stringify(frame)}`);
  }
  return {
    id: out.id,
    type: out.event as SseEvent['type'],
    data: JSON.parse(out.data) as SseEvent['data'],
  };
}

describe('GET /api/events', () => {
  it('responds with text/event-stream and the SSE-friendly headers', async () => {
    const h = await setupApp();
    try {
      const res = await fetch(`${h.baseUrl}/api/events`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
      expect(res.headers.get('cache-control')).toMatch(/no-cache/);
      expect(res.headers.get('connection')).toBe('keep-alive');
      await res.body?.cancel();
    } finally {
      await h.close();
    }
  });

  it('streams a published event with correct id/event/data framing', async () => {
    const h = await setupApp();
    try {
      const res = await fetch(`${h.baseUrl}/api/events`);

      // Give the route handler a tick to register the subscriber.
      await delay(20);
      const published = h.eventBus.publish({
        type: 'tool_calls.changed',
        data: { key: 'KAN-1' },
      });

      const [event] = await readFrames(res, 1);
      expect(event.id).toBe(published.id);
      expect(event.type).toBe('tool_calls.changed');
      expect(event.data).toEqual({ key: 'KAN-1' });
    } finally {
      await h.close();
    }
  });

  it('replays buffered events when last-event-id is supplied via header', async () => {
    const h = await setupApp();
    try {
      const e1 = h.eventBus.publish({ type: 'tool_calls.changed', data: { key: 'A' } });
      h.eventBus.publish({ type: 'tool_calls.changed', data: { key: 'B' } });
      h.eventBus.publish({ type: 'tool_calls.changed', data: { key: 'C' } });

      const res = await fetch(`${h.baseUrl}/api/events`, {
        headers: { 'Last-Event-ID': e1.id },
      });

      const replayed = await readFrames(res, 2);
      expect(
        replayed
          .filter((e) => e.type === 'tool_calls.changed')
          .map((e) => (e.data as { key: string }).key),
      ).toEqual(['B', 'C']);
    } finally {
      await h.close();
    }
  });

  it('replays buffered events when last_event_id is supplied via query param', async () => {
    // Browser EventSource cannot set headers, so the dashboard reconnects
    // with `?last_event_id=...`. The route must accept either source.
    const h = await setupApp();
    try {
      const e1 = h.eventBus.publish({ type: 'tool_calls.changed', data: { key: 'A' } });
      h.eventBus.publish({ type: 'tool_calls.changed', data: { key: 'B' } });

      const res = await fetch(`${h.baseUrl}/api/events?last_event_id=${encodeURIComponent(e1.id)}`);

      const [event] = await readFrames(res, 1);
      expect(event.type).toBe('tool_calls.changed');
      expect((event.data as { key: string }).key).toBe('B');
    } finally {
      await h.close();
    }
  });

  it('emits cache.miss when the supplied last-event-id has been evicted', async () => {
    // Force a tiny ring so eviction happens quickly. We swap in an EventBus
    // with a small bufferSize via the cradle's resolve override path: easier
    // to publish enough events to evict the head than to reconfigure DI.
    const h = await setupApp();
    try {
      // The default ring is 1000. Publish a stale id, then 1001 more so the
      // first one ages out.
      const stale = h.eventBus.publish({ type: 'tool_calls.changed', data: { key: 'stale' } });
      for (let i = 0; i < 1001; i++) {
        h.eventBus.publish({ type: 'tool_calls.changed', data: { key: `k${i}` } });
      }

      const res = await fetch(`${h.baseUrl}/api/events`, {
        headers: { 'Last-Event-ID': stale.id },
      });

      const [event] = await readFrames(res, 1);
      expect(event.type).toBe('cache.miss');
    } finally {
      await h.close();
    }
  });
});
