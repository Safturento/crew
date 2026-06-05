import type { ActionRequest, EnqueueAction } from 'crew-shared';

import type { Agent, Project } from './types.js';

/** CREW-217: current runner health, as served by `GET /api/runner/status`. */
export interface RunnerStatus {
  online: boolean;
  lastSeen: number | null;
}

export interface DaemonClient {
  listProjects(): Promise<Project[]>;
  listAgents(): Promise<Agent[]>;
  enqueueAction(input: EnqueueAction): Promise<ActionRequest>;
  getRunnerStatus(): Promise<RunnerStatus>;
  getRunnerLogs(tail?: number): Promise<string[]>;
}
