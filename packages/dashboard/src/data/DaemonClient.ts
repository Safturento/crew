import type {
  ActionRequest,
  EnqueueAction,
  EnqueueRunnerCommand,
  LiveProcess,
  ProjectTicketsResponse,
  RunnerCommand,
} from 'crew-shared';

import type { Agent, Project, ProjectDetailResponse } from './types.js';

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
  /**
   * Project detail (config + path) for one slug. Already implemented on both
   * concrete clients; surfaced on the interface so the New Run picker can read
   * `project.jira.site` to build the epic-key link's Jira browse base.
   */
  getProject(slug: string): Promise<ProjectDetailResponse>;
  listAgents(): Promise<Agent[]>;
  /**
   * CREW-279: New Run picker — a project's Ready-for-Development tickets,
   * grouped by epic with runnability + active-agent overlay. `available: false`
   * when the daemon has no Jira creds or Jira is unreachable; the modal then
   * degrades to manual ticket-key entry.
   */
  listProjectTickets(slug: string): Promise<ProjectTicketsResponse>;
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
