import { z } from 'zod';

import type { DaemonClient } from './DaemonClient.js';
import type {
  Agent,
  AgentDetail,
  AggregateMetrics,
  Project,
  ProjectDetailResponse,
  StateTransition,
  TranscriptEvent,
} from './types.js';

const ProjectsResponseSchema = z.object({
  projects: z.array(
    z.object({
      name: z.string(),
      repoPath: z.string(),
      branch: z.string(),
      jiraKey: z.string(),
      activeCount: z.number(),
    }),
  ),
});

// Inline rather than importing crew-shared's projectConfigSchema directly:
// the shared barrel re-exports a node-only loader, which Vite refuses to
// bundle for the browser. The daemon's Zod serializer guarantees the
// response shape matches projectConfigSchema, so we re-validate the
// browser-relevant subset here using passthrough on optional sub-objects.
const ProjectConfigShapeSchema = z
  .object({
    name: z.string(),
    repo_path: z.string(),
    default_branch: z.string(),
    jira: z.object({ project_key: z.string(), site: z.string() }).passthrough(),
    github: z.object({ repo: z.string() }).passthrough(),
  })
  .passthrough();

const ProjectDetailResponseSchema = z.object({
  project: ProjectConfigShapeSchema,
  configPath: z.string(),
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
      doc_load_coverage_pct: z.number().nullable(),
      cleanliness_pass: z.number().nullable(),
      pr_claim_input_tokens: z.number().nullable(),
      parity_violations: z.number().nullable(),
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

const AggregateMetricsSchema = z.object({
  runCount: z.number(),
  avgDocLoadCoverage: z.number().nullable(),
  cleanlinessPassRate: z.number(),
  avgPrClaimInputTokens: z.number(),
  parityViolationRate: z.number(),
});

// Daemon already validates JSONL via crew-shared transcript schemas before
// emitting; client-side passthrough avoids re-running the full discriminated
// union here. Tighten only if the daemon stops being the validator.
const TimelineResponseSchema = z.object({
  events: z.array(z.object({ type: z.string() }).passthrough()),
});

export class AgentNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`Agent not found: ${key}`);
    this.name = 'AgentNotFoundError';
  }
}

export class ProjectNotFoundError extends Error {
  constructor(public readonly slug: string) {
    super(`Project not found: ${slug}`);
    this.name = 'ProjectNotFoundError';
  }
}

export class HttpDaemonClient implements DaemonClient {
  constructor(private readonly baseUrl: string = '') {}

  async listProjects(): Promise<Project[]> {
    const res = await fetch(`${this.baseUrl}/api/projects`);
    if (!res.ok) throw new Error(`GET /api/projects: ${res.status}`);
    return ProjectsResponseSchema.parse(await res.json()).projects;
  }

  async getProject(slug: string): Promise<ProjectDetailResponse> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(slug)}`);
    if (res.status === 404) throw new ProjectNotFoundError(slug);
    if (!res.ok) throw new Error(`GET /api/projects/${slug}: ${res.status}`);
    return ProjectDetailResponseSchema.parse(await res.json()) as ProjectDetailResponse;
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

  async getMetrics(baseline: boolean): Promise<AggregateMetrics> {
    const res = await fetch(`${this.baseUrl}/api/metrics?baseline=${baseline ? 'true' : 'false'}`);
    if (!res.ok) throw new Error(`GET /api/metrics: ${res.status}`);
    return AggregateMetricsSchema.parse(await res.json());
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
