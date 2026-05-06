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
});

const AgentDetailTokensSchema = z.object({
  total: z.number(),
  input: z.number(),
  output: z.number(),
  cache_read: z.number(),
  cache_creation: z.number(),
});

const AgentDetailSchema = z.object({
  key: z.string(),
  project: z.string(),
  ticket_key: z.string(),
  ticket_title: z.string().nullable(),
  state: AgentStateEnum,
  worktree_path: z.string(),
  pr_url: z.string().nullable(),
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
}
