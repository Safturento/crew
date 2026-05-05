import { z } from 'zod';

import type { DaemonClient } from './DaemonClient.js';
import type { Agent, Project } from './types.js';

const ProjectsResponseSchema = z.object({
  projects: z.array(
    z.object({
      name: z.string(),
      repoPath: z.string(),
    }),
  ),
});

const AgentSchema = z.object({
  key: z.string(),
  projectName: z.string(),
  ticketTitle: z.string(),
  state: z.enum(['initializing', 'running', 'idle', 'waiting', 'pr_open', 'error', 'finished']),
  startedAt: z.string(),
  tokens: z.number(),
  prUrl: z.string().optional(),
});

const AgentsResponseSchema = z.object({ agents: z.array(AgentSchema) });

export class HttpDaemonClient implements DaemonClient {
  constructor(private readonly baseUrl: string = '') {}

  async listProjects(): Promise<Project[]> {
    const res = await fetch(`${this.baseUrl}/api/projects`);
    if (!res.ok) throw new Error(`GET /api/projects: ${res.status}`);
    return ProjectsResponseSchema.parse(await res.json()).projects;
  }

  async listAgents(): Promise<Agent[]> {
    const res = await fetch(`${this.baseUrl}/api/agents`);
    if (!res.ok) throw new Error(`GET /api/agents: ${res.status}`);
    return AgentsResponseSchema.parse(await res.json()).agents;
  }
}
