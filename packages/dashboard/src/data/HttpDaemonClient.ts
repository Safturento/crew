import { z } from 'zod';

import type { DaemonClient } from './DaemonClient.js';
import type {
  Agent,
  AgentDetail,
  Project,
  StateTransition,
  TranscriptEvent,
} from './types.js';

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

const AgentDetailSchema = z.object({
  key: z.string(),
  project: z.string(),
  ticket_key: z.string(),
  ticket_title: z.string().nullable(),
  state: z.enum(['initializing', 'running', 'idle', 'waiting', 'pr_open', 'error', 'finished']),
  worktree_path: z.string(),
  pr_url: z.string().nullable(),
  runs: z.array(
    z.object({
      id: z.string(),
      command: z.enum(['run', 'fix-pr', 'finish']),
      started_at: z.string(),
      completed_at: z.string().nullable(),
    }),
  ),
  tokens: z.object({
    total: z.number(),
    input: z.number(),
    output: z.number(),
    cache_read: z.number(),
    cache_creation: z.number(),
  }),
  tool_call_count: z.number(),
});

const TransitionStateEnum = z.enum([
  'init',
  'running',
  'pr_open',
  'error',
  'finished',
  'idle',
  'waiting',
]);

const StateHistoryResponseSchema = z.object({
  transitions: z.array(
    z.object({
      from: TransitionStateEnum.nullable(),
      to: TransitionStateEnum,
      ts: z.number(),
    }),
  ),
});

const TimelineResponseSchema = z.object({
  events: z.array(z.object({ type: z.string() }).passthrough()),
});

export class AgentNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`Agent not found: ${key}`);
    this.name = 'AgentNotFoundError';
  }
}

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

  async getAgent(key: string): Promise<AgentDetail> {
    const res = await fetch(`${this.baseUrl}/api/agents/${encodeURIComponent(key)}`);
    if (res.status === 404) throw new AgentNotFoundError(key);
    if (!res.ok) throw new Error(`GET /api/agents/${key}: ${res.status}`);
    return AgentDetailSchema.parse(await res.json());
  }

  async getStateHistory(key: string): Promise<{ transitions: StateTransition[] }> {
    const res = await fetch(`${this.baseUrl}/api/agents/${encodeURIComponent(key)}/state-history`);
    if (!res.ok) throw new Error(`GET /api/agents/${key}/state-history: ${res.status}`);
    return StateHistoryResponseSchema.parse(await res.json());
  }

  async getTimeline(key: string): Promise<{ events: TranscriptEvent[]; warnings?: string[] }> {
    const res = await fetch(`${this.baseUrl}/api/agents/${encodeURIComponent(key)}/timeline`);
    if (!res.ok) throw new Error(`GET /api/agents/${key}/timeline: ${res.status}`);
    const parsed = TimelineResponseSchema.parse(await res.json());
    const events = parsed.events as unknown as TranscriptEvent[];
    const warning = res.headers.get('X-Crew-Warning');
    return warning ? { events, warnings: [warning] } : { events };
  }
}
