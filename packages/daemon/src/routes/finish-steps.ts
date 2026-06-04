import { z } from 'zod';
import { finishStepSchema, FINISH_STEP_STATUSES } from 'crew-shared';
import type { DaemonApp } from '../app.js';

const KeyParamsSchema = z.object({ key: z.string().min(1) });

const FinishStepSchema = z.object({
  key: z.string(),
  index: z.number().int().nonnegative(),
  label: z.string(),
  status: z.enum(FINISH_STEP_STATUSES),
  // Persisted as NULL when omitted on the wire; serialized as null, not
  // dropped, so the dashboard can distinguish "no detail" from "unknown".
  detail: z.string().nullable(),
  ts: z.number(),
});

const FinishStepsResponseSchema = z.object({
  steps: z.array(FinishStepSchema),
});

/**
 * CREW-215 — finish-step intake.
 *
 * - `POST /api/agents/:key/finish-step` — `crew finish` reports one step
 *   per `step()`; stores it + pings `finish_step.changed{key}`. 201 + the
 *   stored step.
 * - `GET  /api/agents/:key/finish-steps` — the ordered checklist for the
 *   agent drawer. Always 200; unknown keys yield `{ steps: [] }`.
 */
export async function registerFinishStepsRoutes(app: DaemonApp): Promise<void> {
  app.post(
    '/api/agents/:key/finish-step',
    {
      schema: {
        params: KeyParamsSchema,
        body: finishStepSchema,
        response: { 201: FinishStepSchema },
      },
    },
    async (req, reply) => {
      const svc = req.diScope.resolve('finishStepsService');
      const step = await svc.record(req.params.key, req.body);
      return reply.code(201).send({ ...step, detail: step.detail ?? null });
    },
  );

  app.get(
    '/api/agents/:key/finish-steps',
    {
      schema: {
        params: KeyParamsSchema,
        response: { 200: FinishStepsResponseSchema },
      },
    },
    async (req) => {
      const svc = req.diScope.resolve('finishStepsService');
      const steps = await svc.list(req.params.key);
      return { steps };
    },
  );
}
