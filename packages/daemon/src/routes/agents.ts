import { z } from 'zod';
import type { DaemonApp } from '../app.js';
import { NotFoundError } from '../errors.js';

const AgentStateEnum = z.enum(['initializing', 'running', 'pr_open', 'error', 'finished']);

const TransitionStateEnum = z.enum([
  'init',
  'running',
  'pr_open',
  'error',
  'finished',
  'idle',
  'waiting',
]);

const AgentSchema = z.object({
  key: z.string(),
  projectName: z.string(),
  ticketTitle: z.string(),
  state: AgentStateEnum,
  startedAt: z.string(),
  tokens: z.number(),
  prUrl: z.string().optional(),
});

const AgentsResponseSchema = z.object({
  agents: z.array(AgentSchema),
});

const AgentDetailRunSchema = z.object({
  id: z.string(),
  command: z.enum(['run', 'fix-pr', 'finish']),
  started_at: z.string(),
  completed_at: z.string().nullable(),
  // Layer-1 metrics (CREW-164) — null until measured on run completion.
  doc_load_coverage_pct: z.number().nullable(),
  cleanliness_pass: z.number().nullable(),
  pr_claim_input_tokens: z.number().nullable(),
  parity_violations: z.number().nullable(),
});

const AgentDetailTokensSchema = z.object({
  total: z.number(),
  input: z.number(),
  output: z.number(),
  cache_read: z.number(),
  cache_creation: z.number(),
});

const AgentDetailTokensByToolSchema = z.object({
  tool: z.string(),
  tokens: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100),
});

const AgentDetailSchema = z.object({
  key: z.string(),
  project: z.string(),
  ticket_key: z.string(),
  ticket_title: z.string().nullable(),
  state: AgentStateEnum,
  worktree_path: z.string(),
  pr_url: z.string().nullable(),
  app_url: z.string().nullable(),
  jira_url: z.string().nullable(),
  tokens_by_tool: z.array(AgentDetailTokensByToolSchema),
  runs: z.array(AgentDetailRunSchema),
  tokens: AgentDetailTokensSchema,
  tool_call_count: z.number(),
});

const StateHistoryResponseSchema = z.object({
  transitions: z.array(
    z.object({
      from: TransitionStateEnum.nullable(),
      to: TransitionStateEnum,
      ts: z.number(),
    }),
  ),
});

const KeyParamsSchema = z.object({ key: z.string().min(1) });

const UpdateTicketTitleBodySchema = z.object({
  ticketTitle: z.string(),
});

export type Agent = z.infer<typeof AgentSchema>;
export type AgentsResponse = z.infer<typeof AgentsResponseSchema>;
export type AgentDetailResponse = z.infer<typeof AgentDetailSchema>;
export type StateHistoryResponse = z.infer<typeof StateHistoryResponseSchema>;

/**
 * Registers the read-only agent endpoints. All resolve `agentsService`
 * from the request's Awilix scope. Response shapes are validated by the
 * Zod serializer compiler so divergence between the service and the
 * wire format fails loudly in tests rather than at the dashboard.
 *
 * - `GET /api/agents`         — derived list (slice 1b).
 * - `GET /api/agents/:key`    — single-agent detail (slice 1c, CREW-98).
 *                               404 when no run exists for the key.
 * - `GET /api/agents/:key/state-history` — ordered transitions from the
 *                               state_transitions table (slice 1c).
 *                               Always 200; unknown keys yield `[]`.
 * - `GET /api/agents/:key/timeline` — re-parsed JSONL events (slice 1c,
 *                               CREW-99). Always 200; missing JSONL
 *                               yields `events: []` plus an
 *                               `X-Crew-Warning: transcript-missing`
 *                               header instead of 404.
 */
export async function registerAgentsRoutes(app: DaemonApp): Promise<void> {
  app.get(
    '/api/agents',
    {
      schema: { response: { 200: AgentsResponseSchema } },
    },
    async (req) => {
      const svc = req.diScope.resolve('agentsService');
      const agents = await svc.list();
      return { agents };
    },
  );

  app.get(
    '/api/agents/:key',
    {
      schema: {
        params: KeyParamsSchema,
        response: { 200: AgentDetailSchema },
      },
    },
    async (req) => {
      const svc = req.diScope.resolve('agentsService');
      const detail = await svc.getByKey(req.params.key);
      if (!detail) {
        throw new NotFoundError('agent_not_found', { resource: 'agent', id: req.params.key });
      }
      return detail;
    },
  );

  app.get(
    '/api/agents/:key/state-history',
    {
      schema: {
        params: KeyParamsSchema,
        response: { 200: StateHistoryResponseSchema },
      },
    },
    async (req) => {
      const svc = req.diScope.resolve('agentsService');
      return svc.getStateHistory(req.params.key);
    },
  );

  // Backfill mechanism for ticket_title on rows registered before the CLI
  // started fetching Jira summaries on registerRun. Takes a string body
  // (empty string clears via the same NULL-on-empty contract as the
  // registerRun upsert). 404 when the key doesn't exist; 204 on success.
  app.patch(
    '/api/agents/:key',
    {
      schema: {
        params: KeyParamsSchema,
        body: UpdateTicketTitleBodySchema,
      },
    },
    async (req, reply) => {
      const svc = req.diScope.resolve('agentsService');
      const updated = await svc.updateTicketTitle(req.params.key, req.body.ticketTitle);
      if (!updated) {
        throw new NotFoundError('agent_not_found', { resource: 'agent', id: req.params.key });
      }
      reply.code(204).send();
    },
  );

  // Per spec §5.3: missing JSONL is graceful — return 200 + empty events +
  // an `X-Crew-Warning: transcript-missing` header so the dashboard can
  // surface the gap without breaking the drawer. No pagination — long
  // timelines are virtualized client-side.
  app.get(
    '/api/agents/:key/timeline',
    {
      schema: { params: KeyParamsSchema },
    },
    async (req, reply) => {
      const { key } = req.params;
      const svc = req.diScope.resolve('timelineService');
      const out = await svc.getTimeline(key);
      if (out.warnings.includes('transcript-missing')) {
        reply.header('X-Crew-Warning', 'transcript-missing');
      }
      return { events: out.events };
    },
  );
}
