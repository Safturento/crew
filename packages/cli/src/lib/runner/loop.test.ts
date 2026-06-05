import { describe, it, expect, vi } from 'vitest';
import type { ActionRequest } from 'crew-shared';
import { runOnce, runLoop, type RunnerLoopDeps, type RunLoopDeps } from './loop.js';

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
});

function runLoopDeps(over: Partial<RunLoopDeps> = {}): RunLoopDeps & {
  client: {
    claimPendingAction: ReturnType<typeof vi.fn>;
    reportActionResult: ReturnType<typeof vi.fn>;
    heartbeat: ReturnType<typeof vi.fn>;
  };
} {
  const base = loopDeps();
  const client = { ...base.client, heartbeat: vi.fn().mockResolvedValue({ online: true }) };
  return { ...base, client, signal: new AbortController().signal, ...over } as never;
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
});
