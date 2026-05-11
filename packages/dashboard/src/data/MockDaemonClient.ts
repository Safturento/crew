import type { DaemonClient } from './DaemonClient.js';
import type { Agent, Project, ProjectDetailResponse } from './types.js';
import { FIXTURE_AGENTS, FIXTURE_PROJECT_DETAILS, FIXTURE_PROJECTS } from './fixtures.js';
import { ProjectNotFoundError } from './HttpDaemonClient.js';

export interface MockDaemonClientOptions {
  agents?: Agent[];
  projects?: Project[];
  projectDetails?: Record<string, ProjectDetailResponse>;
}

export class MockDaemonClient implements DaemonClient {
  private readonly agents: Agent[];
  private readonly projects: Project[];
  private readonly projectDetails: Record<string, ProjectDetailResponse>;

  constructor(options: MockDaemonClientOptions = {}) {
    this.agents = options.agents ?? FIXTURE_AGENTS;
    this.projects = options.projects ?? FIXTURE_PROJECTS;
    this.projectDetails = options.projectDetails ?? FIXTURE_PROJECT_DETAILS;
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
}
