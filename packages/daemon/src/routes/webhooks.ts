import type { DaemonApp } from '../app.js';

/**
 * GitHub webhook receiver (CREW-270). Registered in its own encapsulated plugin
 * so the raw-buffer content-type parser is scoped to THIS route only — the rest
 * of the API keeps the normal JSON parser. The raw bytes are required because
 * the HMAC in `X-Hub-Signature-256` covers exactly what GitHub sent; re-parsing
 * + re-serializing would break the signature. This is the central regression
 * guard for the feature.
 *
 * Only this single path is published to the public internet via a path-scoped
 * Tailscale Funnel mapping; the rest of the daemon stays tailnet-only. Funnel
 * does not surface the originating client IP, so HMAC + the hook-id pin carry
 * the full identity weight (see `.agents/security.md`).
 */
export async function registerWebhookRoutes(app: DaemonApp): Promise<void> {
  await app.register(async (scope) => {
    // Buffer every content-type in this scope, not just application/json: GitHub
    // sends application/json, but a stray content-type must still yield a Buffer
    // for `req.body as Buffer` to hold (and to avoid a 500 — the verification
    // then rejects it cleanly via the HMAC/hook-id path). The catch-all also
    // pre-empts Fastify's default 415 on an unknown media type.
    const toBuffer = (_req: unknown, body: Buffer, done: (err: null, body: Buffer) => void) =>
      done(null, body);
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, toBuffer);
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, toBuffer);
    scope.post('/api/webhooks/github', async (req, reply) => {
      const service = req.diScope.resolve('githubWebhookService');
      const result = await service.handle({
        headers: req.headers,
        rawBody: req.body as Buffer,
      });
      return reply.code(result.status).send(result.body ?? undefined);
    });
  });
}
