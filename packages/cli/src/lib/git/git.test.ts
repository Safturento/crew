import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execa } from 'execa';
import { hasUncommittedChanges, fetchOrigin, rebaseOnto, resolveWorktreePath } from './index.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

const mockedExeca = vi.mocked(execa);

beforeEach(() => mockedExeca.mockReset());

function ok(stdout = ''): void {
  mockedExeca.mockResolvedValueOnce({ stdout, stderr: '', exitCode: 0 } as never);
}

function fail(message = 'fail'): void {
  mockedExeca.mockImplementationOnce(
    () => Promise.reject(Object.assign(new Error(message), { exitCode: 1 })) as never,
  );
}

describe('hasUncommittedChanges', () => {
  it('returns false when both diff calls succeed (clean tree)', async () => {
    ok();
    ok();
    expect(await hasUncommittedChanges('/wt')).toBe(false);
  });

  it('returns true when working-tree diff exits non-zero', async () => {
    fail('dirty');
    ok();
    expect(await hasUncommittedChanges('/wt')).toBe(true);
  });

  it('returns true when staged diff exits non-zero', async () => {
    ok();
    fail('staged');
    expect(await hasUncommittedChanges('/wt')).toBe(true);
  });
});

describe('fetchOrigin', () => {
  it('runs git fetch with the given branch and cwd', async () => {
    ok();
    await fetchOrigin('/wt', 'main');
    expect(mockedExeca).toHaveBeenCalledWith('git', ['fetch', 'origin', 'main'], { cwd: '/wt' });
  });
});

describe('rebaseOnto', () => {
  it('returns ok=true on a clean rebase', async () => {
    ok();
    expect(await rebaseOnto('/wt', 'origin/main')).toEqual({ ok: true });
  });

  it('returns conflict files when the rebase reports a merge state', async () => {
    fail('CONFLICT');
    ok('.git/rebase-merge\n');
    ok(); // test -d succeeds
    ok('src/foo.ts\nsrc/bar.ts\n');

    expect(await rebaseOnto('/wt', 'origin/main')).toEqual({
      ok: false,
      conflicts: ['src/foo.ts', 'src/bar.ts'],
    });
  });

  it('throws when the rebase fails for a non-conflict reason', async () => {
    fail('weird');
    ok('.git/rebase-merge\n');
    fail('no such file');
    ok('.git/rebase-apply\n');
    fail('no such file');

    await expect(rebaseOnto('/wt', 'origin/main')).rejects.toThrow();
  });
});

describe('resolveWorktreePath', () => {
  it('appends -<KEY> as a sibling of the repo root', () => {
    expect(resolveWorktreePath('/home/u/Repos/Recipes-App', 'KAN-23')).toBe(
      '/home/u/Repos/Recipes-App-KAN-23',
    );
  });

  it('handles trailing slashes on the repo root', () => {
    expect(resolveWorktreePath('/home/u/Repos/Recipes-App/', 'KAN-23')).toBe(
      '/home/u/Repos/Recipes-App-KAN-23',
    );
  });
});
