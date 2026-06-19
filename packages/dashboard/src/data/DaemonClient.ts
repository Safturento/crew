import type {
  ActionRequest,
  EnqueueAction,
  EnqueueRunnerCommand,
  LiveProcess,
  RunnerCommand,
} from 'crew-shared';

import type { Agent, Project } from './types.js';

/**
 * CREW-217: current runner health, as served by `GET /api/runner/status`.
 * CREW-245: extended with the live-process snapshot (CREW-242 ships
 * `processes` on the same endpoint + the `runner.snapshot_changed` SSE
 * event) so the Runner page can render the supervisor-held processes.
 */
export interface RunnerStatus {
  online: boolean;
  lastSeen: number | null;
  processes: LiveProcess[];
}

export interface DaemonClient {
  listProjects(): Promise<Project[]>;
  listAgents(): Promise<Agent[]>;
  enqueueAction(input: EnqueueAction): Promise<ActionRequest>;
  getRunnerStatus(): Promise<RunnerStatus>;
  getRunnerLogs(tail?: number): Promise<string[]>;
  /**
   * CREW-245: enqueue a runner reverse-queue control command
   * (`cancel_soft` / `cancel_hard` / `reap` / `dequeue`) via
   * `POST /api/runner/commands`. Backs the Runner page row controls.
   */
  enqueueRunnerCommand(input: EnqueueRunnerCommand): Promise<RunnerCommand>;
  /**
   * CREW-245: acknowledge (Archive) a key's failed-start rows via
   * `POST /api/runs/:key/acknowledge`. Returns the number acknowledged.
   */
  acknowledgeRun(key: string): Promise<number>;
}
