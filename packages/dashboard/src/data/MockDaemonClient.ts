import type { ActionRequest, EnqueueAction } from 'crew-shared';

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

  constructor(options: MockDaemonClientOptions = {}) {
    this.agents = options.agents ?? FIXTURE_AGENTS;
    this.projects = options.projects ?? FIXTURE_PROJECTS;
    this.projectDetails = options.projectDetails ?? FIXTURE_PROJECT_DETAILS;
    this.runnerStatus = options.runnerStatus ?? { online: true, lastSeen: Date.now() };
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
}
