import { z } from 'zod';
import type { DaemonApp } from '../app.js';

// `z.coerce.boolean()` is wrong here — it treats the string "false" as
// truthy. Parse the literal token instead so `?baseline=false` resolves to
// the current cohort and anything else 400s via the central error handler.
const MetricsQuerySchema = z.object({
  baseline: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
});

const MetricsResponseSchema = z.object({
  runCount: z.number(),
  avgDocLoadCoverage: z.number().nullable(),
  cleanlinessPassRate: z.number(),
  avgPrClaimInputTokens: z.number(),
  parityViolationRate: z.number(),
});

export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;

/**
 * Registers `GET /api/metrics?baseline=<bool>` — the Layer-1 metrics
 * aggregate. `baseline=true` returns the pre-rollout baseline cohort;
 * `false` (the default) returns the current cohort. The response shape is
 * pinned by the Zod serializer so service/wire divergence fails in tests.
 */
export async function registerMetricsRoutes(app: DaemonApp): Promise<void> {
  app.get(
    '/api/metrics',
    {
      schema: {
        querystring: MetricsQuerySchema,
        response: { 200: MetricsResponseSchema },
      },
    },
    async (req) => {
      const svc = req.diScope.resolve('metricsService');
      return svc.aggregate({ baseline: req.query.baseline });
    },
  );
}
