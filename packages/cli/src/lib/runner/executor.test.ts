import { describe, it, expect, vi } from 'vitest';
import type { ActionRequest } from 'crew-shared';
import { executeAction, type ExecutorDeps } from './executor.js';

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

function deps(over: Partial<ExecutorDeps> = {}): { deps: ExecutorDeps; exec: ReturnType<typeof vi.fn> } {
  const exec = vi.fn().mockResolvedValue(undefined);
  return {
    exec,
    deps: {
      exec,
      resolveRepoDir: () => '/repos/crew',
      ...over,
    },
  };
}

describe('executeAction', () => {
  it('maps run to `crew run <key>` in the project repo and returns launched', async () => {
    const { deps: d, exec } = deps();
    const result = await executeAction(makeAction({ kind: 'run' }), d);
    expect(result).toEqual({ status: 'launched' });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith('crew', ['run', 'CREW-9'], { cwd: '/repos/crew' });
  });

  it('maps finish to `crew finish <key>`', async () => {
    const { deps: d, exec } = deps();
    await executeAction(makeAction({ kind: 'finish', payload: { kind: 'finish' } }), d);
    expect(exec).toHaveBeenCalledWith('crew', ['finish', 'CREW-9'], { cwd: '/repos/crew' });
  });

  it('posts the PR comment before `crew fix-pr --from-pr` for fix_pr', async () => {
    const { deps: d, exec } = deps();
    const result = await executeAction(
      makeAction({ kind: 'fix_pr', payload: { kind: 'fix_pr', comment: 'please fix the thing' } }),
      d,
    );
    expect(result).toEqual({ status: 'launched' });
    expect(exec.mock.calls[0]).toEqual([
      'gh',
      ['pr', 'comment', 'CREW-9', '--body', 'please fix the thing'],
      { cwd: '/repos/crew' },
    ]);
    expect(exec.mock.calls[1]).toEqual([
      'crew',
      ['fix-pr', 'CREW-9', '--from-pr'],
      { cwd: '/repos/crew' },
    ]);
  });

  it('returns failed with the error message when a command throws', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('spawn crew ENOENT'));
    const result = await executeAction(makeAction({}), { exec, resolveRepoDir: () => '/repos/crew' });
    expect(result).toEqual({ status: 'failed', error: 'spawn crew ENOENT' });
  });

  it('returns failed when the project repo cannot be resolved', async () => {
    const { deps: d, exec } = deps({
      resolveRepoDir: () => {
        throw new Error('no project config at /x/ghost.toml');
      },
    });
    const result = await executeAction(makeAction({ project: 'ghost' }), d);
    expect(result).toEqual({ status: 'failed', error: 'no project config at /x/ghost.toml' });
    expect(exec).not.toHaveBeenCalled();
  });

  it('does not run the fix-pr step if posting the comment fails', async () => {
    const exec = vi
      .fn()
      .mockRejectedValueOnce(new Error('gh: no PR found'))
      .mockResolvedValue(undefined);
    const result = await executeAction(
      makeAction({ kind: 'fix_pr', payload: { kind: 'fix_pr', comment: 'c' } }),
      { exec, resolveRepoDir: () => '/repos/crew' },
    );
    expect(result).toEqual({ status: 'failed', error: 'gh: no PR found' });
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
