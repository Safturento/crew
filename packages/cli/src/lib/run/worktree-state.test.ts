import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));
import { execa } from 'execa';
import { readWorktreeState } from './worktree-state.js';

const execaMock = vi.mocked(execa);

describe('readWorktreeState', () => {
  beforeEach(() => execaMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  function ok(stdout: string): unknown {
    return Promise.resolve({ exitCode: 0, stdout, stderr: '' });
  }

  it('returns branch, commitsAhead, uncommittedCount from git output', async () => {
    execaMock
      .mockReturnValueOnce(ok('KAN-23\n') as ReturnType<typeof execa>)
      .mockReturnValueOnce(ok('3\n') as ReturnType<typeof execa>)
      .mockReturnValueOnce(ok(' M file.ts\n?? new.ts\n M other.ts\n') as ReturnType<typeof execa>);

    const state = await readWorktreeState('/worktree');
    expect(state.branch).toBe('KAN-23');
    expect(state.commitsAhead).toBe(3);
    expect(state.uncommittedCount).toBe(3);
  });

  it('treats blank rev-list output as 0 (branch matches origin/main)', async () => {
    execaMock
      .mockReturnValueOnce(ok('KAN-23\n') as ReturnType<typeof execa>)
      .mockReturnValueOnce(ok('0\n') as ReturnType<typeof execa>)
      .mockReturnValueOnce(ok('') as ReturnType<typeof execa>);

    const state = await readWorktreeState('/worktree');
    expect(state.commitsAhead).toBe(0);
    expect(state.uncommittedCount).toBe(0);
  });

  it('passes the worktree path as cwd to each git invocation', async () => {
    execaMock
      .mockReturnValueOnce(ok('KAN-23\n') as ReturnType<typeof execa>)
      .mockReturnValueOnce(ok('1\n') as ReturnType<typeof execa>)
      .mockReturnValueOnce(ok('') as ReturnType<typeof execa>);

    await readWorktreeState('/some/worktree');
    for (const call of execaMock.mock.calls) {
      expect(call[2]).toMatchObject({ cwd: '/some/worktree' });
    }
  });
});
