import type { DaemonClient } from './DaemonClient.js';
import type { Agent, Project } from './types.js';
import { FIXTURE_AGENTS, FIXTURE_PROJECTS } from './fixtures.js';

export interface MockDaemonClientOptions {
  agents?: Agent[];
  projects?: Project[];
}

export class MockDaemonClient implements DaemonClient {
  private readonly agents: Agent[];
  private readonly projects: Project[];

  constructor(options: MockDaemonClientOptions = {}) {
    this.agents = options.agents ?? FIXTURE_AGENTS;
    this.projects = options.projects ?? FIXTURE_PROJECTS;
  }

  async listProjects(): Promise<Project[]> {
    return this.projects;
  }

  async listAgents(): Promise<Agent[]> {
    return this.agents;
  }
}
