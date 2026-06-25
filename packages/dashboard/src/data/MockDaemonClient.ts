import type {
  ActionRequest,
  EnqueueAction,
  EnqueueRunnerCommand,
  ProjectTicketsResponse,
  RunnerCommand,
} from 'crew-shared';

import type { DaemonClient, RunnerStatus } from './DaemonClient.js';
import type { Agent, Project, ProjectDetailResponse } from './types.js';
import { FIXTURE_AGENTS, FIXTURE_PROJECT_DETAILS, FIXTURE_PROJECTS } from './fixtures.js';
import { ProjectNotFoundError } from './HttpDaemonClient.js';

export interface MockDaemonClientOptions {
  agents?: Agent[];
  projects?: Project[];
  projectDetails?: Record<string, ProjectDetailResponse>;
  runnerStatus?: RunnerStatus;
  runnerLogs?: string[];
}

export class MockDaemonClient implements DaemonClient {
  private readonly agents: Agent[];
  private readonly projects: Project[];
  private readonly projectDetails: Record<string, ProjectDetailResponse>;
  private readonly runnerStatus: RunnerStatus;
  private readonly runnerLogs: string[];
  /** Records of every action enqueued through this mock, for assertions. */
  readonly enqueued: EnqueueAction[] = [];
  /** Records of every runner command enqueued through this mock. */
  readonly enqueuedCommands: EnqueueRunnerCommand[] = [];
  /** Keys acknowledged (Archive) through this mock. */
  readonly acknowledged: string[] = [];

  constructor(options: MockDaemonClientOptions = {}) {
    this.agents = options.agents ?? FIXTURE_AGENTS;
    this.projects = options.projects ?? FIXTURE_PROJECTS;
    this.projectDetails = options.projectDetails ?? FIXTURE_PROJECT_DETAILS;
    this.runnerStatus = options.runnerStatus ?? {
      online: true,
      lastSeen: Date.now(),
      processes: [],
    };
    this.runnerLogs = options.runnerLogs ?? [];
  }

  async listProjects(): Promise<Project[]> {
    return this.projects;
  }

  async listAgents(): Promise<Agent[]> {
    return this.agents;
  }

  async getProject(slug: string): Promise<ProjectDetailResponse> {
    const detail = this.projectDetails[slug];
    if (!detail) throw new ProjectNotFoundError(slug);
    return detail;
  }

  async enqueueAction(input: EnqueueAction): Promise<ActionRequest> {
    this.enqueued.push(input);
    const now = new Date().toISOString();
    const payload: ActionRequest['payload'] =
      input.kind === 'fix_pr' ? { kind: 'fix_pr', comment: input.comment } : { kind: input.kind };
    return {
      id: this.enqueued.length,
      kind: input.kind,
      ticketKey: input.ticketKey,
      project: input.project,
      payload,
      status: 'pending',
      error: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getRunnerStatus(): Promise<RunnerStatus> {
    return this.runnerStatus;
  }

  async getRunnerLogs(): Promise<string[]> {
    return this.runnerLogs;
  }

  async enqueueRunnerCommand(input: EnqueueRunnerCommand): Promise<RunnerCommand> {
    this.enqueuedCommands.push(input);
    const now = new Date().toISOString();
    return {
      id: this.enqueuedCommands.length,
      agentKey: input.agentKey,
      kind: input.kind,
      payload: input.payload ?? null,
      status: 'pending',
      error: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async acknowledgeRun(key: string): Promise<number> {
    this.acknowledged.push(key);
    return 1;
  }

  /**
   * CREW-279: a canned available ticket list for the New Run picker. Exercises
   * every row state the picker renders — a runnable ticket, a blocked ticket
   * (disabled + blocker hint), an in-flight ticket (running badge), and an
   * Ungrouped (parent-less) group. Tests that need the degraded branch override
   * this method per-instance.
   */
  async listProjectTickets(): Promise<ProjectTicketsResponse> {
    return {
      available: true,
      groups: [
        {
          epicKey: 'CREW-100',
          epicSummary: 'Sample Epic',
          tickets: [
            {
              key: 'CREW-101',
              summary: 'Runnable ticket',
              priority: 'High',
              runnable: true,
              blockedBy: [],
              hasActiveAgent: false,
              interactive: false,
            },
            {
              key: 'CREW-102',
              summary: 'Blocked ticket',
              priority: 'Medium',
              runnable: false,
              blockedBy: [{ key: 'CREW-1', summary: 'Blocker' }],
              hasActiveAgent: false,
              interactive: false,
            },
            {
              key: 'CREW-103',
              summary: 'In-flight ticket',
              priority: null,
              runnable: true,
              blockedBy: [],
              hasActiveAgent: true,
              interactive: false,
            },
          ],
        },
        {
          epicKey: null,
          epicSummary: null,
          tickets: [
            {
              key: 'CREW-104',
              summary: 'Ungrouped ticket',
              priority: 'Low',
              runnable: true,
              blockedBy: [],
              hasActiveAgent: false,
              interactive: false,
            },
          ],
        },
      ],
    };
  }
}
