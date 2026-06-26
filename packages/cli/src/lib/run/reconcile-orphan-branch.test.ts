import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));
import { execa } from 'execa';
import { reconcileOrphanBranch } from './reconcile-orphan-branch.js';

const execaMock = vi.mocked(execa);

const repoPath = '/repo';
const key = 'CREW-270';
const defaultBranch = 'main';

function ok(stdout = ''): unknown {
  return Promise.resolve({ exitCode: 0, stdout, stderr: '' });
}

function fail(stderr = '', exitCode = 1): unknown {
  return Promise.resolve({ exitCode, stdout: '', stderr });
}

/** Locate a recorded git call by its first argument. */
function callWithArg(arg: string): string[] | undefined {
  const call = execaMock.mock.calls.find(
    (c) => Array.isArray(c[1]) && (c[1] as string[])[0] === arg,
  );
  return call?.[1] as string[] | undefined;
}

describe('reconcileOrphanBranch', () => {
  beforeEach(() => execaMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('returns { action: "none" } and deletes nothing when the branch does not exist', async () => {
    // show-ref --verify fails => branch absent.
    execaMock.mockReturnValueOnce(fail('', 1) as ReturnType<typeof execa>);

    const result = await reconcileOrphanBranch({ repoPath, key, defaultBranch });

    expect(result).toEqual({ action: 'none' });
    expect(callWithArg('branch')).toBeUndefined();
    expect(callWithArg('rev-list')).toBeUndefined();
  });

  it('deletes a safe orphan branch (no unique commits) and reports "reclaimed"', async () => {
    execaMock
      .mockReturnValueOnce(ok() as ReturnType<typeof execa>) // show-ref: branch exists
      .mockReturnValueOnce(ok('0\n') as ReturnType<typeof execa>) // rev-list: 0 unique commits
      .mockReturnValueOnce(ok() as ReturnType<typeof execa>); // branch -D succeeds

    const result = await reconcileOrphanBranch({ repoPath, key, defaultBranch });

    expect(result).toEqual({ action: 'reclaimed' });
    expect(execaMock).toHaveBeenCalledWith('git', ['branch', '-D', key], expect.any(Object));
  });

  it('counts unique commits against origin/<defaultBranch>', async () => {
    execaMock
      .mockReturnValueOnce(ok() as ReturnType<typeof execa>) // show-ref
      .mockReturnValueOnce(ok('0\n') as ReturnType<typeof execa>) // rev-list
      .mockReturnValueOnce(ok() as ReturnType<typeof execa>); // branch -D

    await reconcileOrphanBranch({ repoPath, key, defaultBranch: 'develop' });

    expect(callWithArg('rev-list')).toEqual([
      'rev-list',
      '--count',
      `origin/develop..refs/heads/${key}`,
    ]);
  });

  it('refuses (throws, keeps the branch) when the branch has unique commits', async () => {
    execaMock
      .mockReturnValueOnce(ok() as ReturnType<typeof execa>) // show-ref
      .mockReturnValueOnce(ok('2\n') as ReturnType<typeof execa>); // rev-list: 2 unique commits

    await expect(reconcileOrphanBranch({ repoPath, key, defaultBranch })).rejects.toThrow(
      /2 unpushed commit/i,
    );
    // never attempts a delete.
    expect(callWithArg('branch')).toBeUndefined();
  });

  it('refuses with an actionable error (mentions the key and a discard command)', async () => {
    execaMock
      .mockReturnValueOnce(ok() as ReturnType<typeof execa>)
      .mockReturnValueOnce(ok('1\n') as ReturnType<typeof execa>);

    await expect(reconcileOrphanBranch({ repoPath, key, defaultBranch })).rejects.toThrow(
      new RegExp(`branch -D ${key}`),
    );
  });

  it('refuses rather than guessing when the unique-commit count cannot be computed', async () => {
    execaMock
      .mockReturnValueOnce(ok() as ReturnType<typeof execa>) // show-ref
      .mockReturnValueOnce(fail('fatal: bad revision', 128) as ReturnType<typeof execa>); // rev-list errors

    await expect(reconcileOrphanBranch({ repoPath, key, defaultBranch })).rejects.toThrow(
      /could not be determined/i,
    );
    expect(callWithArg('branch')).toBeUndefined();
  });

  it('refuses (does not delete) when rev-list exits 0 but its output is not a number', async () => {
    // Defensive: a clean exit with unparseable stdout must not fall through to a
    // delete — err toward keeping the branch, matching the exit≠0 stance.
    execaMock
      .mockReturnValueOnce(ok() as ReturnType<typeof execa>) // show-ref
      .mockReturnValueOnce(ok('not-a-number\n') as ReturnType<typeof execa>); // rev-list: garbage

    await expect(reconcileOrphanBranch({ repoPath, key, defaultBranch })).rejects.toThrow(
      /could not be determined/i,
    );
    expect(callWithArg('branch')).toBeUndefined();
  });

  it('surfaces the git reason when a safe-orphan delete fails (e.g. checked out elsewhere)', async () => {
    execaMock
      .mockReturnValueOnce(ok() as ReturnType<typeof execa>) // show-ref
      .mockReturnValueOnce(ok('0\n') as ReturnType<typeof execa>) // rev-list: safe
      .mockReturnValueOnce(
        fail("error: branch 'CREW-270' is currently checked out at /elsewhere", 1) as ReturnType<
          typeof execa
        >,
      ); // branch -D fails

    await expect(reconcileOrphanBranch({ repoPath, key, defaultBranch })).rejects.toThrow(
      /checked out/i,
    );
  });

  it('runs every git invocation with repoPath as cwd', async () => {
    execaMock
      .mockReturnValueOnce(ok() as ReturnType<typeof execa>)
      .mockReturnValueOnce(ok('0\n') as ReturnType<typeof execa>)
      .mockReturnValueOnce(ok() as ReturnType<typeof execa>);

    await reconcileOrphanBranch({ repoPath, key, defaultBranch });

    expect(execaMock.mock.calls.length).toBeGreaterThan(0);
    for (const call of execaMock.mock.calls) {
      const [cmd, , options] = call as unknown as [string, string[], { cwd?: string }];
      expect(cmd).toBe('git');
      expect(options).toMatchObject({ cwd: repoPath });
    }
  });
});
