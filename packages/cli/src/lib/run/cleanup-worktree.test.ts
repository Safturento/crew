import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('execa', () => ({ execa: vi.fn() }));
import { execa } from 'execa';
import { removeWorktreeAndBranch } from './cleanup-worktree.js';

const execaMock = vi.mocked(execa);

describe('removeWorktreeAndBranch', () => {
  let worktree: string;
  const key = 'KAN-1';

  beforeEach(() => {
    worktree = join(tmpdir(), `crew-cleanup-wt-${process.pid}-${Date.now()}`);
    execaMock.mockReset();
  });

  afterEach(() => {
    if (existsSync(worktree)) rmSync(worktree, { recursive: true, force: true });
  });

  function fakeOk(stdout = ''): unknown {
    return Promise.resolve({ exitCode: 0, stdout, stderr: '' });
  }

  function fakeFail(stderr: string): unknown {
    return Promise.resolve({ exitCode: 128, stdout: '', stderr });
  }

  it('reports already-removed when worktree path does not exist', async () => {
    execaMock.mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>);
    const result = await removeWorktreeAndBranch({ worktree, key });
    expect(result.worktreeRemoved).toBe(false);
    expect(execaMock).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['worktree', 'remove']),
      expect.any(Object),
    );
  });

  it('runs git worktree remove when the path exists', async () => {
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, 'sentinel'), '');
    execaMock
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>)
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>);

    const result = await removeWorktreeAndBranch({ worktree, key });
    expect(result.worktreeRemoved).toBe(true);
    expect(result.branchRemoved).toBe(true);
    expect(execaMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', worktree, '--force'],
      expect.any(Object),
    );
    expect(execaMock).toHaveBeenCalledWith('git', ['branch', '-D', key], expect.any(Object));
  });

  it('treats a missing branch as already-removed (rc=128)', async () => {
    mkdirSync(worktree, { recursive: true });
    execaMock
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>)
      .mockReturnValueOnce(
        fakeFail("error: branch 'KAN-1' not found.") as ReturnType<typeof execa>,
      );

    const result = await removeWorktreeAndBranch({ worktree, key });
    expect(result.worktreeRemoved).toBe(true);
    expect(result.branchRemoved).toBe(false);
  });

  it('treats a worktree-remove failure (rc=128) as already-removed', async () => {
    mkdirSync(worktree, { recursive: true });
    execaMock
      .mockReturnValueOnce(fakeFail('fatal: ... is not a working tree') as ReturnType<typeof execa>)
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>);

    const result = await removeWorktreeAndBranch({ worktree, key });
    expect(result.worktreeRemoved).toBe(false);
    expect(result.branchRemoved).toBe(true);
  });
});
