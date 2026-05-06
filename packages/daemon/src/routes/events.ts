import { z } from 'zod';
import type { DaemonApp } from '../app.js';
import type { SseEvent } from '../services/EventBus.js';

const QuerySchema = z.object({
  /**
   * Browser EventSource cannot set headers, so the dashboard reconnects
   * with `?last_event_id=<id>`. Either source is accepted; query takes
   * precedence when both are set (the explicit reconnect URL is the
   * client's stronger signal).
   */
  last_event_id: z.string().optional(),
});

/**
 * `GET /api/events` — SSE firehose.
 *
 * Uses Fastify's `reply.raw` (the underlying Node `ServerResponse`)
 * directly: writing the SSE preamble + frames bypasses Fastify's
 * response serializers, which is what we want for `text/event-stream`.
 * `reply.hijack()` tells Fastify "I'm taking over this socket; don't
 * send my framework-level response on top." Without it, Fastify will
 * emit a normal response after the handler returns and break the
 * stream.
 *
 * `last-event-id` may arrive in either the header (native EventSource
 * reconnects use this) or `?last_event_id=` (browser reconnects + manual
 * cURL/Bruno smokes that can't set the header). Query wins when both are
 * present.
 */
export async function registerEventsRoutes(app: DaemonApp): Promise<void> {
  app.get(
    '/api/events',
    {
      schema: { querystring: QuerySchema },
    },
    (req, reply) => {
      const eventBus = req.diScope.resolve('eventBus');

      const headerId =
        typeof req.headers['last-event-id'] === 'string'
          ? req.headers['last-event-id']
          : undefined;
      const queryId = req.query.last_event_id;
      const lastEventId = queryId ?? headerId;

      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      // Flush headers so the client's `fetch` resolves with status + headers
      // before the first frame lands.
      reply.raw.flushHeaders?.();

      const send = (event: SseEvent): void => {
        reply.raw.write(
          `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
        );
      };

      const unsubscribe = eventBus.subscribe({ lastEventId, onEvent: send });

      const cleanup = (): void => {
        unsubscribe();
        if (!reply.raw.writableEnded) reply.raw.end();
      };
      req.raw.on('close', cleanup);
    },
  );
}
