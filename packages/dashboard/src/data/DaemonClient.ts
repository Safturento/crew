import type { Agent, Project } from './types.js';

export interface DaemonClient {
  listProjects(): Promise<Project[]>;
  listAgents(): Promise<Agent[]>;
}
