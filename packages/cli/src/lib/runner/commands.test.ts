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

  it.each<RunnerCommandKind>(['dequeue', 'pause', 'resume', 'message'])(
    'reports %s as not yet supported by the host runner',
    async (kind) => {
      const { deps: d } = deps();
      const result = await applyCommand(command({ kind }), d);
      expect(result.status).toBe('failed');
      if (result.status === 'failed') expect(result.error).toMatch(/not yet supported/i);
    },
  );
});
