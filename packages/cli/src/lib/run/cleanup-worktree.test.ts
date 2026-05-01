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
    worktree = join(tmpdir(), `crew-cleanup-wt-${process.pid}-${Date.now()}-${Math.random()}`);
    execaMock.mockReset();
  });

  afterEach(() => {
    if (existsSync(worktree)) rmSync(worktree, { recursive: true, force: true });
  });

  function fakeOk(stdout = ''): unknown {
    return Promise.resolve({ exitCode: 0, stdout, stderr: '' });
  }

  function fakeFail(stderr: string, exitCode = 128): unknown {
    return Promise.resolve({ exitCode, stdout: '', stderr });
  }

  function fakeBranchListing(stdout: string): unknown {
    return Promise.resolve({ exitCode: 0, stdout, stderr: '' });
  }

  it('invokes git worktree prune once at the start', async () => {
    execaMock
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>) // prune
      .mockReturnValueOnce(fakeBranchListing('') as ReturnType<typeof execa>); // branch --list

    await removeWorktreeAndBranch({ worktree, key });

    const pruneCalls = execaMock.mock.calls.filter(
      ([cmd, args]) =>
        cmd === 'git' && Array.isArray(args) && args[0] === 'worktree' && args[1] === 'prune',
    );
    expect(pruneCalls).toHaveLength(1);
    // Prune must be the very first git invocation.
    expect(execaMock.mock.calls[0]).toEqual(['git', ['worktree', 'prune'], expect.any(Object)]);
  });

  it('reports notFound when worktree path does not exist and branch never existed', async () => {
    execaMock
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>) // prune
      .mockReturnValueOnce(fakeBranchListing('') as ReturnType<typeof execa>); // branch --list (empty)

    const result = await removeWorktreeAndBranch({ worktree, key });

    expect(result.worktree).toBe('notFound');
    expect(result.branch).toBe('notFound');
    expect(result.worktreeError).toBeUndefined();
    expect(result.branchError).toBeUndefined();

    expect(execaMock).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['worktree', 'remove']),
      expect.any(Object),
    );
    expect(execaMock).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['branch', '-D']),
      expect.any(Object),
    );
  });

  it('reports removed when the worktree path exists and git accepts both removals', async () => {
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, 'sentinel'), '');
    execaMock
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>) // prune
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>) // worktree remove
      .mockReturnValueOnce(fakeBranchListing(`  ${key}\n`) as ReturnType<typeof execa>) // branch --list
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>); // branch -D

    const result = await removeWorktreeAndBranch({ worktree, key });

    expect(result.worktree).toBe('removed');
    expect(result.branch).toBe('removed');
    expect(execaMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', worktree, '--force'],
      expect.any(Object),
    );
    expect(execaMock).toHaveBeenCalledWith('git', ['branch', '-D', key], expect.any(Object));
  });

  it('orphan path: git refuses, dir on disk gets cleaned up via rm -rf fallback', async () => {
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, 'sentinel'), 'orphan content');

    const stderrMessage = `fatal: '${worktree}' is not a working tree`;
    execaMock
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>) // prune
      .mockReturnValueOnce(fakeFail(stderrMessage, 128) as ReturnType<typeof execa>) // worktree remove fails
      .mockReturnValueOnce(fakeBranchListing('') as ReturnType<typeof execa>); // branch --list (empty)

    const result = await removeWorktreeAndBranch({ worktree, key });

    expect(result.worktree).toBe('orphanCleaned');
    expect(result.worktreeError).toContain('not a working tree');
    expect(existsSync(worktree)).toBe(false);
  });

  it('branch checked out elsewhere: rc=1 surfaces the error rather than masquerading as removed', async () => {
    const branchStderr = `error: branch '${key}' is currently checked out at /other/worktree`;
    execaMock
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>) // prune
      .mockReturnValueOnce(fakeBranchListing(`  ${key}\n`) as ReturnType<typeof execa>) // branch --list
      .mockReturnValueOnce(fakeFail(branchStderr, 1) as ReturnType<typeof execa>); // branch -D fails

    const result = await removeWorktreeAndBranch({ worktree, key });

    expect(result.branch).toBe('failed');
    expect(result.branchError).toContain('checked out at');
  });

  it('branch never existed: git branch -D is not invoked', async () => {
    execaMock
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>) // prune
      .mockReturnValueOnce(fakeBranchListing('') as ReturnType<typeof execa>); // branch --list (empty)

    const result = await removeWorktreeAndBranch({ worktree, key });

    expect(result.branch).toBe('notFound');
    expect(execaMock).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['branch', '-D']),
      expect.any(Object),
    );
  });
});
