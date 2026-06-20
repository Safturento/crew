import { z } from 'zod';
import {
  ACTION_KINDS,
  ACTION_STATUSES,
  enqueueActionSchema,
  type ActionRequest,
} from 'crew-shared';
import type { DaemonApp } from '../app.js';

/** Wire shape of an `ActionRequest` — the daemon's response on enqueue/claim. */
const ActionPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('run') }),
  z.object({ kind: z.literal('fix_pr'), comment: z.string() }),
  z.object({ kind: z.literal('finish') }),
  z.object({ kind: z.literal('resume') }),
]);

const ActionRequestSchema = z.object({
  id: z.number(),
  kind: z.enum(ACTION_KINDS),
  ticketKey: z.string(),
  project: z.string(),
  payload: ActionPayloadSchema,
  status: z.enum(ACTION_STATUSES),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const PendingQuerySchema = z.object({
  /** How long to hold the long-poll open before giving up with a null body. */
  timeoutMs: z.coerce.number().int().positive().max(60_000).default(25_000),
});

const ResultParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const ResultBodySchema = z.object({
  status: z.enum(['launching', 'launched', 'failed']),
  error: z.string().optional(),
});

/**
 * Dashboard-triggered action queue (CREW-214). Three thin routes over
 * `ActionService`:
 *
 * - `POST /api/actions` enqueues a request. The body is validated by the
 *   shared `enqueueActionSchema`; the target `project` must be registered
 *   (a `getBySlug` miss throws `NotFoundError` → 404 from the central
 *   handler). Returns the new `pending` row (201).
 * - `GET /api/actions/pending` is the runner's long-poll: it claims the
 *   oldest pending row immediately if one exists, otherwise it subscribes
 *   to the event bus and waits up to `timeoutMs` for one to land, claiming
 *   it the moment it appears. Returns the claimed row (200) or a 200 with a
 *   `null` body on timeout. The claim is atomic in `ActionService`, so
 *   concurrent runners never get the same row.
 * - `POST /api/actions/:id/result` records the host-side launch outcome
 *   (204; 404 on an unknown id).
 *
 * Each transition emits an `action.changed` SSE event from the service.
 */
export async function registerActionsRoutes(app: DaemonApp): Promise<void> {
  app.post(
    '/api/actions',
    {
      schema: {
        body: enqueueActionSchema,
        response: { 201: ActionRequestSchema },
      },
    },
    async (req, reply) => {
      // Validate the target project is registered. getBySlug throws
      // NotFoundError (→ 404) for an unknown slug — the daemon won't queue
      // work against a project it can't resolve a repo path for.
      req.diScope.resolve('projectsService').getBySlug(req.body.project);
      const action = await req.diScope.resolve('actionService').enqueue(req.body);
      return reply.code(201).send(action);
    },
  );

  app.get(
    '/api/actions/pending',
    {
      schema: {
        querystring: PendingQuerySchema,
        // 200 with the claimed row, or `null` body when the long-poll times
        // out with nothing pending. A null body keeps the runner client a
        // single `ActionRequest | null` shape with no status-code branching.
        response: { 200: ActionRequestSchema.nullable() },
      },
    },
    async (req, reply) => {
      const actionService = req.diScope.resolve('actionService');
      const eventBus = req.diScope.resolve('eventBus');
      const { timeoutMs } = req.query;

      const claimed = await new Promise<ActionRequest | null>((resolve, reject) => {
        // At most one claim is in flight at a time. `wakePending` records a
        // wakeup that arrived mid-claim so we re-attempt once the current one
        // settles, and `timedOut` lets an in-flight claim resolve the request
        // on its own tail. Never abandoning an in-flight claim is what keeps a
        // row from being claimed *after* the timeout already resolved `null`
        // (which would strand it in `claimed` forever).
        let inFlight = false;
        let wakePending = false;
        let timedOut = false;

        const cleanup = (): void => {
          clearTimeout(timer);
          unsubscribe();
        };

        const attempt = (): void => {
          if (inFlight) {
            wakePending = true;
            return;
          }
          inFlight = true;
          void actionService
            .claimNextPending()
            .then((row) => {
              inFlight = false;
              if (row) {
                cleanup();
                resolve(row);
                return;
              }
              if (wakePending) {
                wakePending = false;
                attempt();
                return;
              }
              if (timedOut) {
                cleanup();
                resolve(null);
              }
            })
            .catch((err: unknown) => {
              inFlight = false;
              cleanup();
              // Reject the awaited promise → 500 via the central handler;
              // don't silently hang the long-poll on a DB error.
              reject(err instanceof Error ? err : new Error(String(err)));
            });
        };

        const timer = setTimeout(() => {
          timedOut = true;
          if (!inFlight) {
            cleanup();
            resolve(null);
          }
        }, timeoutMs);
        // Subscribe BEFORE the first claim attempt so a row landing between
        // the attempt and the subscription can't slip through unseen.
        const unsubscribe = eventBus.subscribe({
          onEvent: (event) => {
            if (event.type === 'action.changed' && event.data.status === 'pending') attempt();
          },
        });
        attempt();
      });

      return reply.code(200).send(claimed);
    },
  );

  app.post(
    '/api/actions/:id/result',
    {
      schema: {
        params: ResultParamsSchema,
        body: ResultBodySchema,
      },
    },
    async (req, reply) => {
      await req.diScope
        .resolve('actionService')
        .report(req.params.id, req.body.status, req.body.error);
      return reply.code(204).send();
    },
  );
}
