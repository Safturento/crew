import { describe, it, expect, vi } from 'vitest';
import type { RunnerCommand, RunnerCommandKind } from 'crew-shared';
import { applyCommand, type ApplyCommandDeps } from './commands.js';
import { Registry } from './registry.js';

function command(over: Partial<RunnerCommand> = {}): RunnerCommand {
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

function deps(over: Partial<ApplyCommandDeps> = {}): {
  deps: ApplyCommandDeps;
  registry: Registry;
  kill: ReturnType<typeof vi.fn>;
} {
  const registry = new Registry();
  registry.add({
    agentKey: 'CREW-231',
    command: 'run',
    pid: 10,
    pgid: 10,
    actionRequestId: 1,
    spawnedAt: '2026-06-16T00:00:00.000Z',
    state: 'running',
    project: 'crew',
  });
  const kill = vi.fn();
  return { registry, kill, deps: { registry, kill, ...over } };
}

describe('applyCommand', () => {
  it('cancel_soft SIGTERMs the negative pgid and marks the entry cancelling', async () => {
    const { deps: d, registry, kill } = deps();
    const result = await applyCommand(command({ kind: 'cancel_soft' }), d);
    expect(result).toEqual({ status: 'applied' });
    expect(kill).toHaveBeenCalledWith(-10, 'SIGTERM');
    expect(registry.get('CREW-231')?.state).toBe('cancelling');
  });

  it('cancel_hard SIGKILLs the negative pgid and stops tracking the entry', async () => {
    const { deps: d, registry, kill } = deps();
    const result = await applyCommand(command({ kind: 'cancel_hard' }), d);
    expect(result).toEqual({ status: 'applied' });
    expect(kill).toHaveBeenCalledWith(-10, 'SIGKILL');
    expect(registry.get('CREW-231')).toBeUndefined();
  });

  it('reap stops tracking the entry without signalling', async () => {
    const { deps: d, registry, kill } = deps();
    const result = await applyCommand(command({ kind: 'reap' }), d);
    expect(result).toEqual({ status: 'applied' });
    expect(kill).not.toHaveBeenCalled();
    expect(registry.get('CREW-231')).toBeUndefined();
  });

  it('reap is applied even when nothing is tracked (orphan already gone)', async () => {
    const { deps: d, kill } = deps();
    const result = await applyCommand(command({ kind: 'reap', agentKey: 'CREW-ghost' }), d);
    expect(result).toEqual({ status: 'applied' });
    expect(kill).not.toHaveBeenCalled();
  });

  it('cancel_soft fails when no process is tracked for the key', async () => {
    const { deps: d, kill } = deps();
    const result = await applyCommand(command({ kind: 'cancel_soft', agentKey: 'CREW-ghost' }), d);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.error).toMatch(/no tracked process/i);
    expect(kill).not.toHaveBeenCalled();
  });

  it('a cancel command with a null agentKey fails (cancels target a live process)', async () => {
    const { deps: d } = deps();
    const result = await applyCommand(command({ kind: 'cancel_hard', agentKey: null }), d);
    expect(result.status).toBe('failed');
  });

  it('reports a kill that throws as failed without crashing', async () => {
    const { deps: d } = deps({
      kill: vi.fn(() => {
        throw new Error('ESRCH');
      }),
    });
    const result = await applyCommand(command({ kind: 'cancel_soft' }), d);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.error).toBe('ESRCH');
  });

  it.each<RunnerCommandKind>(['dequeue'])(
    'reports %s as not yet supported by the host runner',
    async (kind) => {
      const { deps: d } = deps();
      const result = await applyCommand(command({ kind }), d);
      expect(result.status).toBe('failed');
      if (result.status === 'failed') expect(result.error).toMatch(/not yet supported/i);
    },
  );

  describe('pause', () => {
    it('SIGTERMs the negative pgid, marks the entry paused, and keeps it tracked', async () => {
      const { deps: d, registry, kill } = deps();
      const result = await applyCommand(command({ kind: 'pause' }), d);
      expect(result).toEqual({ status: 'applied' });
      expect(kill).toHaveBeenCalledWith(-10, 'SIGTERM');
      // Unlike cancel_*, the paused entry stays in the snapshot.
      expect(registry.get('CREW-231')?.state).toBe('paused');
    });

    it('fails when no process is tracked for the key', async () => {
      const { deps: d, kill } = deps();
      const result = await applyCommand(command({ kind: 'pause', agentKey: 'CREW-ghost' }), d);
      expect(result.status).toBe('failed');
      if (result.status === 'failed') expect(result.error).toMatch(/no tracked process/i);
      expect(kill).not.toHaveBeenCalled();
    });

    it('writes the pause sentinel BEFORE SIGTERMing the group (CREW-273 producer)', async () => {
      const order: string[] = [];
      const writePauseSentinel = vi.fn(() => order.push('sentinel'));
      const kill = vi.fn(() => order.push('kill'));
      const { deps: d, registry } = deps({ writePauseSentinel, kill });

      const result = await applyCommand(command({ kind: 'pause' }), d);

      expect(result).toEqual({ status: 'applied' });
      expect(writePauseSentinel).toHaveBeenCalledWith('CREW-231');
      // Durable before the signal — else run.ts's handler reads no sentinel and
      // settles the run terminally (cancel) instead of pausing it.
      expect(order).toEqual(['sentinel', 'kill']);
      expect(registry.get('CREW-231')?.state).toBe('paused');
    });

    it('does not write a sentinel when the entry is missing (never SIGTERMs)', async () => {
      const writePauseSentinel = vi.fn();
      const { deps: d } = deps({ writePauseSentinel });
      const result = await applyCommand(command({ kind: 'pause', agentKey: 'CREW-ghost' }), d);
      expect(result.status).toBe('failed');
      expect(writePauseSentinel).not.toHaveBeenCalled();
    });
  });

  describe('cancel does not write a pause sentinel', () => {
    it.each<RunnerCommandKind>(['cancel_soft', 'cancel_hard'])('%s', async (kind) => {
      const writePauseSentinel = vi.fn();
      const { deps: d } = deps({ writePauseSentinel });
      await applyCommand(command({ kind }), d);
      expect(writePauseSentinel).not.toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('re-dispatches via the resume boundary and re-registers running with the new pid/pgid', async () => {
      const resume = vi.fn().mockResolvedValue({ pid: 99, pgid: 99 });
      const { deps: d, registry } = deps({ resume });
      registry.setState('CREW-231', 'paused');

      const result = await applyCommand(command({ kind: 'resume' }), d);

      expect(result).toEqual({ status: 'applied' });
      expect(resume).toHaveBeenCalledWith('CREW-231', undefined);
      const entry = registry.get('CREW-231');
      expect(entry?.state).toBe('running');
      expect(entry?.pid).toBe(99);
      expect(entry?.pgid).toBe(99);
    });

    it('fails when no process is tracked for the key', async () => {
      const resume = vi.fn();
      const { deps: d } = deps({ resume });
      const result = await applyCommand(command({ kind: 'resume', agentKey: 'CREW-ghost' }), d);
      expect(result.status).toBe('failed');
      if (result.status === 'failed') expect(result.error).toMatch(/no tracked process/i);
      expect(resume).not.toHaveBeenCalled();
    });

    it('fails when no resume boundary is configured', async () => {
      const { deps: d, registry } = deps();
      registry.setState('CREW-231', 'paused');
      const result = await applyCommand(command({ kind: 'resume' }), d);
      expect(result.status).toBe('failed');
      if (result.status === 'failed') expect(result.error).toMatch(/resume boundary/i);
      // The entry is untouched — still paused, not promoted to running.
      expect(registry.get('CREW-231')?.state).toBe('paused');
    });

    it('reports a resume boundary that rejects as failed and leaves the entry untouched', async () => {
      const resume = vi.fn().mockRejectedValue(new Error('crew not on PATH'));
      const { deps: d, registry } = deps({ resume });
      registry.setState('CREW-231', 'paused');

      const result = await applyCommand(command({ kind: 'resume' }), d);

      expect(result.status).toBe('failed');
      if (result.status === 'failed') expect(result.error).toBe('crew not on PATH');
      // Not promoted to running; the operator can retry the resume.
      expect(registry.get('CREW-231')?.state).toBe('paused');
    });
  });

  describe('message', () => {
    it('re-dispatches via the resume boundary forwarding payload.message', async () => {
      const resume = vi.fn().mockResolvedValue({ pid: 77, pgid: 77 });
      const { deps: d, registry } = deps({ resume });
      registry.setState('CREW-231', 'paused');

      const result = await applyCommand(
        command({ kind: 'message', payload: { message: 'focus on the failing test' } }),
        d,
      );

      expect(result).toEqual({ status: 'applied' });
      expect(resume).toHaveBeenCalledWith('CREW-231', 'focus on the failing test');
      expect(registry.get('CREW-231')?.state).toBe('running');
    });
  });
});
