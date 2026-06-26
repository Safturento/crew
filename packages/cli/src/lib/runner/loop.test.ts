import { describe, it, expect, vi } from 'vitest';
import type { ActionRequest, RunnerCommand } from 'crew-shared';
import {
  runOnce,
  runLoop,
  drainCommands,
  type DrainCommandsDeps,
  type RunnerLoopDeps,
  type RunLoopDeps,
} from './loop.js';
import { Registry } from './registry.js';

function makeCommand(over: Partial<RunnerCommand> = {}): RunnerCommand {
  return {
    id: 1,
    agentKey: 'CREW-231',
    kind: 'cancel_soft',
    payload: null,
    status: 'claimed',
    error: null,
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
    ...over,
  };
}

function trackedRegistry(): Registry {
  const r = new Registry();
  r.add({
    agentKey: 'CREW-231',
    command: 'run',
    pid: 10,
    pgid: 10,
    actionRequestId: 1,
    spawnedAt: '2026-06-16T00:00:00.000Z',
    state: 'running',
    project: 'crew',
  });
  return r;
}

const claimed: ActionRequest = {
  id: 5,
  kind: 'run',
  ticketKey: 'CREW-3',
  project: 'crew',
  payload: { kind: 'run' },
  status: 'claimed',
  error: null,
  createdAt: '2026-06-04T00:00:00Z',
  updatedAt: '2026-06-04T00:00:00Z',
};

function loopDeps(over: Partial<RunnerLoopDeps> = {}): RunnerLoopDeps & {
  client: {
    claimPendingAction: ReturnType<typeof vi.fn>;
    reportActionResult: ReturnType<typeof vi.fn>;
  };
  execute: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
} {
  const client = {
    claimPendingAction: vi.fn().mockResolvedValue({ action: null }),
    reportActionResult: vi.fn().mockResolvedValue({ ok: true }),
  };
  const execute = vi.fn().mockResolvedValue({ status: 'launched' });
  const log = vi.fn();
  return { client, execute, log, ...over } as never;
}

describe('runOnce', () => {
  it('returns idle when the long-poll yields no action', async () => {
    const d = loopDeps();
    const outcome = await runOnce(d);
    expect(outcome).toBe('idle');
    expect(d.execute).not.toHaveBeenCalled();
    expect(d.client.reportActionResult).not.toHaveBeenCalled();
  });

  it('returns poll_error and does not execute when the claim errors', async () => {
    const d = loopDeps();
    d.client.claimPendingAction.mockResolvedValue({ ok: false, reason: 'connect_error' });
    const outcome = await runOnce(d);
    expect(outcome).toBe('poll_error');
    expect(d.execute).not.toHaveBeenCalled();
  });

  it('reports launching before executing, then launched, in order', async () => {
    const d = loopDeps();
    d.client.claimPendingAction.mockResolvedValue({ action: claimed });
    const calls: string[] = [];
    d.client.reportActionResult.mockImplementation(async (_id: number, status: string) => {
      calls.push(`report:${status}`);
      return { ok: true };
    });
    d.execute.mockImplementation(async () => {
      calls.push('execute');
      return { status: 'launched' };
    });

    const outcome = await runOnce(d);

    expect(outcome).toBe('launched');
    expect(calls).toEqual(['report:launching', 'execute', 'report:launched']);
    expect(d.client.reportActionResult).toHaveBeenNthCalledWith(1, 5, 'launching');
    expect(d.client.reportActionResult).toHaveBeenNthCalledWith(2, 5, 'launched');
  });

  it('reports failed with the error when execution fails', async () => {
    const d = loopDeps();
    d.client.claimPendingAction.mockResolvedValue({ action: claimed });
    d.execute.mockResolvedValue({ status: 'failed', error: 'spawn ENOENT' });
    const outcome = await runOnce(d);
    expect(outcome).toBe('failed');
    expect(d.client.reportActionResult).toHaveBeenNthCalledWith(2, 5, 'failed', 'spawn ENOENT');
  });

  it('degrades to poll_error (does not throw) on an unexpected error mid-iteration', async () => {
    const d = loopDeps();
    d.client.claimPendingAction.mockResolvedValue({ action: claimed });
    d.client.reportActionResult.mockRejectedValue(new Error('socket hang up'));
    // A throw here would kill the worker and trigger a supervisor respawn; we
    // want it absorbed into a backoff-and-retry instead.
    const outcome = await runOnce(d);
    expect(outcome).toBe('poll_error');
  });
});

function runLoopDeps(over: Partial<RunLoopDeps> = {}): RunLoopDeps & {
  client: {
    claimPendingAction: ReturnType<typeof vi.fn>;
    reportActionResult: ReturnType<typeof vi.fn>;
    heartbeat: ReturnType<typeof vi.fn>;
    claimPendingCommand: ReturnType<typeof vi.fn>;
    reportCommandResult: ReturnType<typeof vi.fn>;
  };
} {
  const base = loopDeps();
  const client = {
    ...base.client,
    heartbeat: vi.fn().mockResolvedValue({ online: true }),
    claimPendingCommand: vi.fn().mockResolvedValue({ command: null }),
    reportCommandResult: vi.fn().mockResolvedValue({ ok: true }),
  };
  return {
    ...base,
    client,
    registry: new Registry(),
    kill: vi.fn(),
    isAlive: vi.fn().mockReturnValue(true),
    signal: new AbortController().signal,
    ...over,
  } as never;
}

describe('runLoop', () => {
  it('heartbeats at least once and stops when the signal aborts', async () => {
    const controller = new AbortController();
    const d = runLoopDeps({ signal: controller.signal });
    d.client.claimPendingAction.mockImplementation(async () => {
      controller.abort();
      return { action: null };
    });

    await runLoop(d);

    expect(d.client.heartbeat).toHaveBeenCalled();
    expect(d.client.claimPendingAction).toHaveBeenCalledTimes(1);
  });

  it('backs off after a poll error instead of busy-looping', async () => {
    const controller = new AbortController();
    // The backoff sleep is what ends the loop here — modelling "daemon down,
    // wait, then we were told to stop" rather than aborting mid-claim.
    const sleep = vi.fn().mockImplementation(async () => {
      controller.abort();
    });
    const d = runLoopDeps({ signal: controller.signal, sleep, errorBackoffMs: 1234 });
    d.client.claimPendingAction.mockResolvedValue({ ok: false, reason: 'connect_error' });

    await runLoop(d);

    expect(sleep).toHaveBeenCalledWith(1234);
    expect(d.client.claimPendingAction).toHaveBeenCalledTimes(1);
  });

  it('heartbeats with the registry snapshot, not a bare ping', async () => {
    const controller = new AbortController();
    const registry = trackedRegistry();
    const d = runLoopDeps({ signal: controller.signal, registry });
    d.client.claimPendingAction.mockImplementation(async () => {
      controller.abort();
      return { action: null };
    });

    await runLoop(d);

    expect(d.client.heartbeat).toHaveBeenCalledWith(registry.toSnapshot());
    expect(d.client.heartbeat.mock.calls[0][0].processes).toHaveLength(1);
  });

  it('reaps a dead-pid process before the heartbeat snapshot (no phantom running)', async () => {
    const controller = new AbortController();
    const registry = trackedRegistry(); // one entry, pid 10
    // pid 10 is dead; the sweep must drop it before serializing the snapshot.
    const d = runLoopDeps({ signal: controller.signal, registry, isAlive: () => false });
    d.client.claimPendingAction.mockImplementation(async () => {
      controller.abort();
      return { action: null };
    });

    await runLoop(d);

    expect(d.client.heartbeat).toHaveBeenCalled();
    expect(d.client.heartbeat.mock.calls[0][0].processes).toHaveLength(0);
  });

  it('retains a live-pid process in the heartbeat snapshot', async () => {
    const controller = new AbortController();
    const registry = trackedRegistry();
    const d = runLoopDeps({ signal: controller.signal, registry, isAlive: () => true });
    d.client.claimPendingAction.mockImplementation(async () => {
      controller.abort();
      return { action: null };
    });

    await runLoop(d);

    expect(d.client.heartbeat.mock.calls[0][0].processes).toHaveLength(1);
  });

  it('drains pending commands each cycle', async () => {
    const controller = new AbortController();
    const d = runLoopDeps({ signal: controller.signal, registry: trackedRegistry() });
    d.client.claimPendingAction.mockImplementation(async () => {
      controller.abort();
      return { action: null };
    });

    await runLoop(d);

    expect(d.client.claimPendingCommand).toHaveBeenCalled();
  });

  it('applies a queued command even while the action long-poll is blocked', async () => {
    const controller = new AbortController();
    const kill = vi.fn();
    const d = runLoopDeps({ signal: controller.signal, registry: trackedRegistry(), kill });
    // Model an idle 25s action long-poll: it never returns until we abort. The
    // command drain must NOT be gated behind it.
    d.client.claimPendingAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          controller.signal.addEventListener('abort', () => resolve({ action: null }), {
            once: true,
          });
        }),
    );
    d.client.claimPendingCommand
      .mockResolvedValueOnce({ command: makeCommand({ id: 9, kind: 'cancel_soft' }) })
      .mockResolvedValue({ command: null });

    const loop = runLoop(d);
    await vi.waitFor(() => expect(kill).toHaveBeenCalledWith(-10, 'SIGTERM'));
    controller.abort();
    await loop;

    expect(d.client.reportCommandResult).toHaveBeenCalledWith(9, 'applied');
  });
});

describe('drainCommands', () => {
  function drainDeps(over: Partial<DrainCommandsDeps> = {}): DrainCommandsDeps & {
    client: {
      claimPendingCommand: ReturnType<typeof vi.fn>;
      reportCommandResult: ReturnType<typeof vi.fn>;
    };
    kill: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  } {
    const client = {
      claimPendingCommand: vi.fn().mockResolvedValue({ command: null }),
      reportCommandResult: vi.fn().mockResolvedValue({ ok: true }),
    };
    const kill = vi.fn();
    const log = vi.fn();
    return {
      client,
      kill,
      log,
      registry: trackedRegistry(),
      ...over,
    } as never;
  }

  it('claims, applies, and reports each pending command until the queue drains', async () => {
    const d = drainDeps();
    d.client.claimPendingCommand
      .mockResolvedValueOnce({ command: makeCommand({ id: 1, kind: 'cancel_soft' }) })
      .mockResolvedValueOnce({ command: null });

    await drainCommands(d);

    expect(d.kill).toHaveBeenCalledWith(-10, 'SIGTERM');
    expect(d.client.reportCommandResult).toHaveBeenCalledWith(1, 'applied');
    // Claimed twice: once for the command, once to discover the empty queue.
    expect(d.client.claimPendingCommand).toHaveBeenCalledTimes(2);
  });

  it('forwards the resume boundary to applyCommand for a resume command', async () => {
    const resume = vi.fn().mockResolvedValue({ pid: 42, pgid: 42 });
    const d = drainDeps({ resume });
    d.client.claimPendingCommand
      .mockResolvedValueOnce({
        command: makeCommand({ id: 3, kind: 'message', payload: { message: 'steer here' } }),
      })
      .mockResolvedValueOnce({ command: null });

    await drainCommands(d);

    expect(resume).toHaveBeenCalledWith('CREW-231', 'steer here');
    expect(d.client.reportCommandResult).toHaveBeenCalledWith(3, 'applied');
  });

  it('reports a failed apply with the error and keeps draining', async () => {
    const d = drainDeps();
    d.client.claimPendingCommand
      .mockResolvedValueOnce({
        command: makeCommand({ id: 2, kind: 'cancel_soft', agentKey: 'CREW-ghost' }),
      })
      .mockResolvedValueOnce({ command: null });

    await drainCommands(d);

    expect(d.client.reportCommandResult).toHaveBeenCalledWith(
      2,
      'failed',
      expect.stringMatching(/no tracked process/i),
    );
  });

  it('stops draining on a claim transport error without throwing', async () => {
    const d = drainDeps();
    d.client.claimPendingCommand.mockResolvedValue({ ok: false, reason: 'connect_error' });

    await expect(drainCommands(d)).resolves.toBeUndefined();
    expect(d.client.reportCommandResult).not.toHaveBeenCalled();
  });

  it('returns immediately when the queue is empty', async () => {
    const d = drainDeps();
    await drainCommands(d);
    expect(d.client.claimPendingCommand).toHaveBeenCalledTimes(1);
    expect(d.client.reportCommandResult).not.toHaveBeenCalled();
  });
});
