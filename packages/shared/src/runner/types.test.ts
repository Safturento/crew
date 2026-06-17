import { describe, expect, it } from 'vitest';
import {
  RUNNER_COMMAND_KINDS,
  LIVE_PROCESS_STATES,
  RUN_STATUSES,
  type LiveProcess,
  type RunnerCommand,
  type RunnerSnapshot,
  type RunFailure,
  type RunStatus,
} from './types.js';

describe('runner constant tuples', () => {
  it('enumerate the command-kind contract values', () => {
    expect(RUNNER_COMMAND_KINDS).toEqual([
      'cancel_soft',
      'cancel_hard',
      'dequeue',
      'reap',
      'pause',
      'resume',
      'message',
    ]);
  });

  it('enumerate the live-process states', () => {
    expect(LIVE_PROCESS_STATES).toEqual(['launching', 'running', 'cancelling', 'paused']);
  });

  it('enumerate the run-lifecycle statuses', () => {
    expect(RUN_STATUSES).toEqual(['launching', 'running', 'failed-start']);
  });
});

describe('runner type shapes', () => {
  it('a LiveProcess assembles into a RunnerSnapshot', () => {
    const process: LiveProcess = {
      agentKey: 'CREW-231',
      command: 'run',
      pid: 4242,
      pgid: 4242,
      actionRequestId: 7,
      spawnedAt: '2026-06-16T00:00:00.000Z',
      state: 'running',
      project: 'crew',
    };
    const snapshot: RunnerSnapshot = { processes: [process] };
    expect(snapshot.processes[0].agentKey).toBe('CREW-231');
  });

  it('a RunnerCommand carries the queue lifecycle fields', () => {
    const command: RunnerCommand = {
      id: 1,
      agentKey: 'CREW-231',
      kind: 'cancel_soft',
      payload: { message: 'wrap up' },
      status: 'pending',
      error: null,
      createdAt: '2026-06-16T00:00:00.000Z',
      updatedAt: '2026-06-16T00:00:00.000Z',
    };
    expect(command.kind).toBe('cancel_soft');
    expect(command.payload?.message).toBe('wrap up');
  });

  it('a RunFailure captures the failed-start diagnosis', () => {
    const failure: RunFailure = {
      check: 'git-remote',
      headline: 'No git remote configured',
      remediation: 'Add an origin remote and retry.',
      output: 'fatal: No such remote',
    };
    expect(failure.check).toBe('git-remote');
  });

  it('a RunStatus is one of the lifecycle tuple values', () => {
    const status: RunStatus = 'failed-start';
    expect(RUN_STATUSES).toContain(status);
  });
});
