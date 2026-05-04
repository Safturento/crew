import { z } from 'zod';
import type { DaemonApp } from '../app.js';

const AgentSchema = z.object({
  key: z.string(),
  projectName: z.string(),
  ticketTitle: z.string(),
  state: z.enum(['initializing', 'running', 'pr_open', 'error', 'finished']),
  startedAt: z.string(),
  tokens: z.number(),
  prUrl: z.string().optional(),
});

const AgentsResponseSchema = z.object({
  agents: z.array(AgentSchema),
});

export type Agent = z.infer<typeof AgentSchema>;
export type AgentsResponse = z.infer<typeof AgentsResponseSchema>;

/**
 * Registers `GET /api/agents`. Resolves `agentsService` from the Awilix
 * scope and returns its derived list. Response is validated by the Zod
 * serializer compiler so a divergent shape fails loudly in tests rather
 * than at the dashboard.
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
}
