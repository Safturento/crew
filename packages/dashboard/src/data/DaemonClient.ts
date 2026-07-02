import type {
  ActionRequest,
  EnqueueAction,
  EnqueueRunnerCommand,
  LiveProcess,
  ProjectTicketsResponse,
  ReconcileRollup,
  RunnerCommand,
  RunnerPage,
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
  /**
   * CREW-292: tail the supervisor's process-management log (the
   * spawn/respawn/heartbeat/reap slice of `runner.log`) for the supervisor
   * drawer, via `GET /api/runner/supervisor-log`. Resolves to `[]` when no
   * runner log exists — the normal state on a worktree stack.
   */
  getSupervisorLog(tail?: number): Promise<string[]>;
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
  /**
   * CREW-291: the Runner page's read surface — `failedToStart` / `queued` /
   * `recentlyEnded` from `GET /api/runner/page` (CREW-290 / T2). Backs the
   * three previously-stubbed sections.
   */
  getRunnerPage(): Promise<RunnerPage>;
  /**
   * CREW-311: the housekeeping roll-up from `GET /api/runner/reconcile`
   * (CREW-310) — queued + orphaned agents across all projects. Backs the
   * runner chip's orphaned-count badge and the supervisor drawer's
   * Reconcile section.
   */
  reconcile(): Promise<ReconcileRollup>;
  /**
   * CREW-291: a run's raw startup console log from
   * `GET /api/runs/:key/startup-log`. Returns the body text, or `null` when no
   * log exists yet (404 — a run that never captured one). Feeds the run drawer.
   */
  getStartupLog(key: string): Promise<string | null>;
}
