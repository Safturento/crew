import type { RunFailure } from 'crew-shared';

/** The command a run/process was launched with. */
export type RunnerCommandName = 'run' | 'fix-pr' | 'finish';

/** A run that died during init/preflight — the Failed-to-start attention queue. */
export interface FailedStartView {
  key: string;
  command: RunnerCommandName;
  project: string;
  failedAt: string; // ISO
  failure: RunFailure;
}

/** A pending action request not yet spawned — the Queued-actions section. */
export interface QueuedActionView {
  key: string;
  command: RunnerCommandName;
  project: string;
  queuedAt: string; // ISO
}

/** A run that is `running` in the DB but has no live process — Unmanaged. */
export interface UnmanagedView {
  key: string;
  project: string;
  startedAt: string; // ISO
}

export type EndedKind = 'finished' | 'cancelled' | 'error' | 'failed-start';

/** A terminal run for the Recently-ended history. */
export interface EndedRunView {
  key: string;
  command: RunnerCommandName;
  project: string;
  endedAt: string; // ISO
  kind: EndedKind;
  /** finished → PR link target. */
  prUrl?: string;
  /** finished → PR number, for the "PR #340" label. */
  prNumber?: number;
  /** error / failed-start → the Inspect modal payload. */
  failure?: RunFailure;
}

/** The supervisor process health. */
export interface SupervisorView {
  online: boolean;
  lastSeen: number | null;
}
