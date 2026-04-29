import type { DaemonClient } from './DaemonClient.js';
import type { Agent, Project } from './types.js';

interface ProjectsSource {
  listProjects(): Promise<Project[]>;
}

interface AgentsSource {
  listAgents(): Promise<Agent[]>;
}

// TODO(slice 1b): replace with a single HttpDaemonClient once /api/agents ships.
export class HybridDaemonClient implements DaemonClient {
  constructor(
    private readonly projectsSource: ProjectsSource,
    private readonly agentsSource: AgentsSource,
  ) {}

  listProjects(): Promise<Project[]> {
    return this.projectsSource.listProjects();
  }

  listAgents(): Promise<Agent[]> {
    return this.agentsSource.listAgents();
  }
}
