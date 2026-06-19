import { describe, it, expect, vi } from 'vitest';
import type { ActionRequest } from 'crew-shared';
import { executeAction, type ExecutorDeps } from './executor.js';
import { Registry } from './registry.js';

function makeAction(over: Partial<ActionRequest>): ActionRequest {
  return {
    id: 1,
    kind: 'run',
    ticketKey: 'CREW-9',
    project: 'crew',
    payload: { kind: 'run' },
    status: 'claimed',
    error: null,
    createdAt: '2026-06-04T00:00:00Z',
    updatedAt: '2026-06-04T00:00:00Z',
    ...over,
  };
}

function deps(over: Partial<ExecutorDeps> = {}): {
  deps: ExecutorDeps;
  exec: ReturnType<typeof vi.fn>;
  launch: ReturnType<typeof vi.fn>;
  registry: Registry;
} {
  const exec = vi.fn().mockResolvedValue(undefined);
  const launch = vi.fn().mockResolvedValue({ pid: 100, pgid: 100 });
  const registry = new Registry();
  return {
    exec,
    launch,
    registry,
    deps: {
      exec,
      launch,
      registry,
      resolveRepoDir: () => '/repos/crew',
      now: () => new Date('2026-06-16T00:00:00.000Z'),
      ...over,
    },
  };
}

describe('executeAction', () => {
  it('launches `crew run <key>` (detached) in the project repo and returns launched', async () => {
    const { deps: d, launch, exec } = deps();
    const result = await executeAction(makeAction({ kind: 'run' }), d);
    expect(result).toEqual({ status: 'launched' });
    expect(launch).toHaveBeenCalledWith('crew', ['run', 'CREW-9'], { cwd: '/repos/crew' });
    expect(exec).not.toHaveBeenCalled();
  });

  it('launches `crew finish <key>`', async () => {
    const { deps: d, launch } = deps();
    await executeAction(makeAction({ kind: 'finish', payload: { kind: 'finish' } }), d);
    expect(launch).toHaveBeenCalledWith('crew', ['finish', 'CREW-9'], { cwd: '/repos/crew' });
  });

  it('runs `gh pr comment` to completion before launching `crew fix-pr --from-pr`', async () => {
    const { deps: d, exec, launch } = deps();
    const order: string[] = [];
    exec.mockImplementation(async () => {
      order.push('comment');
    });
    launch.mockImplementation(async () => {
      order.push('fix-pr');
      return { pid: 100, pgid: 100 };
    });
    const result = await executeAction(
      makeAction({ kind: 'fix_pr', payload: { kind: 'fix_pr', comment: 'please fix the thing' } }),
      d,
    );
    expect(result).toEqual({ status: 'launched' });
    expect(order).toEqual(['comment', 'fix-pr']);
    expect(exec).toHaveBeenCalledWith(
      'gh',
      ['pr', 'comment', 'CREW-9', '--body', 'please fix the thing'],
      { cwd: '/repos/crew' },
    );
    expect(launch).toHaveBeenCalledWith('crew', ['fix-pr', 'CREW-9', '--from-pr'], {
      cwd: '/repos/crew',
    });
  });

  it('returns failed with the error message when a launch throws', async () => {
    const { deps: d, launch } = deps();
    launch.mockRejectedValue(new Error('spawn crew ENOENT'));
    const result = await executeAction(makeAction({}), d);
    expect(result).toEqual({ status: 'failed', error: 'spawn crew ENOENT' });
  });

  it('records the spawned process in the registry, keyed by ticket key', async () => {
    const { deps: d, registry } = deps();
    await executeAction(makeAction({ kind: 'run', id: 7 }), d);
    const entry = registry.get('CREW-9');
    expect(entry).toMatchObject({
      agentKey: 'CREW-9',
      command: 'run',
      pid: 100,
      pgid: 100,
      actionRequestId: 7,
      state: 'running',
      project: 'crew',
      spawnedAt: '2026-06-16T00:00:00.000Z',
    });
  });

  it('maps the fix_pr action kind to the fix-pr live-process command', async () => {
    const { deps: d, registry } = deps();
    await executeAction(
      makeAction({ kind: 'fix_pr', payload: { kind: 'fix_pr', comment: 'c' } }),
      d,
    );
    expect(registry.get('CREW-9')?.command).toBe('fix-pr');
  });

  it('does not record a registry entry when the launch fails', async () => {
    const { deps: d, launch, registry } = deps();
    launch.mockRejectedValue(new Error('spawn crew ENOENT'));
    await executeAction(makeAction({}), d);
    expect(registry.get('CREW-9')).toBeUndefined();
  });

  it('returns failed when the project repo cannot be resolved', async () => {
    const { deps: d, launch } = deps({
      resolveRepoDir: () => {
        throw new Error('no project config at /x/ghost.toml');
      },
    });
    const result = await executeAction(makeAction({ project: 'ghost' }), d);
    expect(result).toEqual({ status: 'failed', error: 'no project config at /x/ghost.toml' });
    expect(launch).not.toHaveBeenCalled();
  });

  it('does not launch fix-pr if posting the comment fails', async () => {
    const { deps: d, exec, launch } = deps();
    exec.mockRejectedValue(new Error('gh: no PR found'));
    const result = await executeAction(
      makeAction({ kind: 'fix_pr', payload: { kind: 'fix_pr', comment: 'c' } }),
      d,
    );
    expect(result).toEqual({ status: 'failed', error: 'gh: no PR found' });
    expect(launch).not.toHaveBeenCalled();
  });
});
