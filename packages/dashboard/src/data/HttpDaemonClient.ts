import { z } from 'zod';
import type {
  ActionRequest,
  EnqueueAction,
  EnqueueRunnerCommand,
  ProjectTicketsResponse,
  RunnerCommand,
} from 'crew-shared';

import type { DaemonClient, RunnerStatus } from './DaemonClient.js';
import { agentStateToTransitionState } from './state-meta.js';
import type {
  Agent,
  AgentDetail,
  AgentState,
  AggregateMetrics,
  FinishStep,
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
  state: z.enum([
    'initializing',
    'running',
    'idle',
    'waiting',
    'pr_open',
    'pr_merged',
    'error',
    'finished',
  ]),
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
  state: z.enum([
    'initializing',
    'running',
    'idle',
    'waiting',
    'pr_open',
    'pr_merged',
    'error',
    'finished',
  ]),
  worktree_path: z.string(),
  pr_url: z.string().nullable(),
  app_url: z.string().nullable(),
  jira_url: z.string().nullable(),
  tokens_by_tool: z.array(
    z.object({
      tool: z.string(),
      tokens: z.object({
        input: z.number(),
        output: z.number(),
        cacheCreation: z.number(),
        cacheRead: z.number(),
      }),
      totalTokens: z.number(),
    }),
  ),
  model: z.string(),
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
  'pr_merged',
  'error',
  'finished',
  'idle',
  'waiting',
]);

const AgentStateEnum = z.enum([
  'initializing',
  'running',
  'idle',
  'waiting',
  'pr_open',
  'pr_merged',
  'error',
  'finished',
]);

/**
 * CREW-202: POST /api/agents/:key/refresh-pr-status response shape.
 * `newState` is only present when `stateChanged: true`.
 */
const RefreshPrStatusResponseSchema = z.object({
  stateChanged: z.boolean(),
  newState: AgentStateEnum.optional(),
});

export type RefreshPrStatusResponse = z.infer<typeof RefreshPrStatusResponseSchema>;

/**
 * CREW-217: wire schemas for the dashboard action layer. Defined locally
 * (rather than importing the `crew-shared` zod values) to stay consistent
 * with the inline-schema convention above — the shared barrel re-exports a
 * node-only loader Vite won't bundle, so only the *types* cross over.
 */
const ActionPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('run') }),
  z.object({ kind: z.literal('fix_pr'), comment: z.string() }),
  z.object({ kind: z.literal('finish') }),
  z.object({ kind: z.literal('resume') }),
]);

const ActionRequestSchema = z.object({
  id: z.number(),
  kind: z.enum(['run', 'fix_pr', 'finish', 'resume']),
  ticketKey: z.string(),
  project: z.string(),
  payload: ActionPayloadSchema,
  status: z.enum(['pending', 'claimed', 'launching', 'launched', 'failed']),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * CREW-245: the live-process snapshot entry. Mirrors `crew-shared`'s
 * `liveProcessSchema` inline, per this file's "only types cross over from
 * crew-shared (the barrel re-exports a node-only loader Vite won't bundle)"
 * convention.
 */
const LiveProcessSchema = z.object({
  agentKey: z.string(),
  command: z.enum(['run', 'fix-pr', 'finish', 'resume']),
  pid: z.number(),
  pgid: z.number(),
  actionRequestId: z.number().nullable(),
  spawnedAt: z.string(),
  state: z.enum(['launching', 'running', 'cancelling', 'paused']),
  project: z.string(),
});

const RunnerStatusSchema = z.object({
  online: z.boolean(),
  lastSeen: z.number().nullable(),
  // CREW-242 ships `processes` on `GET /api/runner/status`; default to []
  // so a legacy daemon that omits it still parses.
  processes: z.array(LiveProcessSchema).default([]),
});

/** CREW-245: wire shape of an enqueued `RunnerCommand` (the 201 body). */
const RunnerCommandSchema = z.object({
  id: z.number(),
  agentKey: z.string().nullable(),
  kind: z.enum(['cancel_soft', 'cancel_hard', 'dequeue', 'reap', 'pause', 'resume', 'message']),
  payload: z.object({ message: z.string().optional() }).nullable(),
  status: z.enum(['pending', 'claimed', 'applied', 'failed']),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const AcknowledgeRunSchema = z.object({ acknowledged: z.number() });

/**
 * CREW-279: wire shape of `GET /api/projects/:slug/tickets` (the New Run
 * picker). Mirrors `crew-shared`'s `projectTicketsResponseSchema` inline, per
 * this file's "only types cross over from crew-shared (the barrel re-exports a
 * node-only loader Vite won't bundle)" convention. The daemon's Zod serializer
 * guarantees the shape; this re-validates the browser-relevant subset.
 */
const PickerTicketSchema = z.object({
  key: z.string(),
  summary: z.string(),
  priority: z.string().nullable(),
  runnable: z.boolean(),
  blockedBy: z.array(z.object({ key: z.string(), summary: z.string() })),
  hasActiveAgent: z.boolean(),
  interactive: z.boolean(),
});

const TicketGroupSchema = z.object({
  epicKey: z.string().nullable(),
  epicSummary: z.string().nullable(),
  tickets: z.array(PickerTicketSchema),
});

const ProjectTicketsResponseSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(true), groups: z.array(TicketGroupSchema) }),
  z.object({
    available: z.literal(false),
    reason: z.enum(['no_credentials', 'jira_unreachable']),
  }),
]);

/**
 * CREW-220: `GET /api/agents/:key/finish-steps` response. Each step is the
 * stored shape — `detail` is nullable (NULL in the DB). Defined locally per
 * the inline-schema convention; only the `FinishStep` *type* crosses over
 * from `crew-shared`.
 */
const FinishStepsResponseSchema = z.object({
  steps: z.array(
    z.object({
      key: z.string(),
      index: z.number(),
      label: z.string(),
      status: z.enum(['ok', 'skip', 'error']),
      detail: z.string().nullable(),
      ts: z.number(),
    }),
  ),
});

const RunnerLogsSchema = z.object({
  lines: z.array(z.string()),
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

  /**
   * CREW-220: the ordered `crew finish` step checklist for one agent. Seeds
   * `useFinishSteps()` on mount; the SSE `finish_step.changed` ping drives a
   * refetch as new steps stream in.
   */
  async getFinishSteps(key: string): Promise<FinishStep[]> {
    const res = await fetch(`${this.baseUrl}/api/agents/${encodeURIComponent(key)}/finish-steps`);
    if (!res.ok) throw new Error(`GET /api/agents/${key}/finish-steps: ${res.status}`);
    return FinishStepsResponseSchema.parse(await res.json()).steps;
  }

  /**
   * CREW-202: trigger the daemon's manual PR-state check for one agent.
   * Backs the drawer's "Refresh PR" button. The daemon either no-ops
   * (PR still OPEN, agent not in pr_open, or agent has no pr_url) or
   * writes a `pr_open → pr_merged` transition and returns `newState`.
   * 404s become AgentNotFoundError so the UI can match its existing
   * not-found pattern; other non-2xx throw the generic shape.
   */
  async refreshPrStatus(key: string): Promise<RefreshPrStatusResponse> {
    const res = await fetch(
      `${this.baseUrl}/api/agents/${encodeURIComponent(key)}/refresh-pr-status`,
      { method: 'POST' },
    );
    if (res.status === 404) throw new AgentNotFoundError(key);
    if (!res.ok) throw new Error(`POST /api/agents/${key}/refresh-pr-status: ${res.status}`);
    return RefreshPrStatusResponseSchema.parse(await res.json());
  }

  /**
   * CREW-260: operator escape hatch — force an agent to `state`, bypassing the
   * daemon's reducer + its terminal stickiness. Mirrors the refresh-pr-status
   * POST shape. The dashboard models states as `AgentState` (`initializing`)
   * but the route speaks the `TransitionState` vocabulary (`init`), so the
   * label is mapped on the way out. The badge updates over the existing
   * `agent.state_changed` SSE; we don't need the response body. 404s become
   * AgentNotFoundError to match the not-found pattern used elsewhere.
   */
  async overrideState(key: string, state: AgentState): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/agents/${encodeURIComponent(key)}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: agentStateToTransitionState(state) }),
    });
    if (res.status === 404) throw new AgentNotFoundError(key);
    if (!res.ok) throw new Error(`POST /api/agents/${key}/state: ${res.status}`);
  }

  /**
   * CREW-217: enqueue a dashboard-triggered action (`run` / `fix_pr` /
   * `finish`). The daemon records it as `pending` and a host runner drains
   * it; the returned `ActionRequest` carries the new id + status. The body
   * is the `enqueueActionSchema` shape (validated server-side).
   */
  async enqueueAction(input: EnqueueAction): Promise<ActionRequest> {
    const res = await fetch(`${this.baseUrl}/api/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`POST /api/actions: ${res.status}`);
    return ActionRequestSchema.parse(await res.json());
  }

  /**
   * CREW-217: current runner online/offline + last-heartbeat epoch-ms.
   * Seeds `useRunnerStatus()` on mount; SSE `runner.status_changed` keeps
   * it live thereafter.
   */
  async getRunnerStatus(): Promise<RunnerStatus> {
    const res = await fetch(`${this.baseUrl}/api/runner/status`);
    if (!res.ok) throw new Error(`GET /api/runner/status: ${res.status}`);
    return RunnerStatusSchema.parse(await res.json());
  }

  /**
   * CREW-221: tail the host runner's log. Returns the trailing `tail` lines
   * (daemon default when omitted), or `[]` when no runner log exists yet —
   * the normal state on a worktree stack that runs no runner. Backs the
   * log viewer opened from the runner health chip.
   */
  async getRunnerLogs(tail?: number): Promise<string[]> {
    const qs = tail === undefined ? '' : `?tail=${tail}`;
    const res = await fetch(`${this.baseUrl}/api/runner/logs${qs}`);
    if (!res.ok) throw new Error(`GET /api/runner/logs: ${res.status}`);
    return RunnerLogsSchema.parse(await res.json()).lines;
  }

  /**
   * CREW-245: enqueue a runner reverse-queue control command. The daemon
   * persists it `pending`; the host runner drains + applies it each cycle
   * (signals the tracked process-group / drops a pending action / settles
   * an orphan). Backs the Runner page row controls (Cancel/Force kill/
   * Reap/Dequeue).
   */
  async enqueueRunnerCommand(input: EnqueueRunnerCommand): Promise<RunnerCommand> {
    const res = await fetch(`${this.baseUrl}/api/runner/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`POST /api/runner/commands: ${res.status}`);
    return RunnerCommandSchema.parse(await res.json());
  }

  /**
   * CREW-245: acknowledge (Archive) a key's unacknowledged failed-start
   * rows. Idempotent — re-acknowledging returns 0. Backs the Failed-to-start
   * section's Archive control.
   */
  async acknowledgeRun(key: string): Promise<number> {
    const res = await fetch(`${this.baseUrl}/api/runs/${encodeURIComponent(key)}/acknowledge`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`POST /api/runs/${key}/acknowledge: ${res.status}`);
    return AcknowledgeRunSchema.parse(await res.json()).acknowledged;
  }

  /**
   * CREW-279: the New Run picker's ticket list for one project. A degraded
   * list (`available: false`) is still a 200 — the daemon returns it when it
   * has no Jira creds or Jira is unreachable, and the modal degrades to manual
   * ticket-key entry. Only a non-2xx is a real failure.
   */
  async listProjectTickets(slug: string): Promise<ProjectTicketsResponse> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(slug)}/tickets`);
    if (!res.ok) throw new Error(`GET /api/projects/${slug}/tickets: ${res.status}`);
    return ProjectTicketsResponseSchema.parse(await res.json());
  }
}
