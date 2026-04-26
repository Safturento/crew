import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execa } from 'execa';
import { unlink } from 'node:fs/promises';
import { computeWorktreePath, isInsideWorktree, runFinish, type FinishDeps } from './finish.js';
import type { ProjectConfig } from '../lib/index.js';

vi.mock('execa', () => ({ execa: vi.fn() }));
vi.mock('node:fs/promises', () => ({ unlink: vi.fn() }));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const mockedExeca = vi.mocked(execa);
const mockedUnlink = vi.mocked(unlink);

const sampleConfig: ProjectConfig = {
  name: 'recipes-app',
  repo_path: '/home/u/Repos/Recipes-App',
  default_branch: 'main',
  jira: {
    project_key: 'KAN',
    site: 'https://safturento.atlassian.net',
  },
  github: { repo: 'Safturento/Recipes' },
  db_clone: {
    postgres_service: 'postgres',
    postgres_user: 'postgres',
    postgres_database: 'postgres',
    required_tables: [],
    exclude_tables: ['kysely_migration*'],
  },
};

function makeDeps(overrides: Partial<FinishDeps> = {}): FinishDeps & {
  logs: string[];
  warns: string[];
} {
  const logs: string[] = [];
  const warns: string[] = [];
  return {
    cwd: '/home/u/Repos/Recipes-App',
    config: sampleConfig,
    jiraSecrets: { email: 'me@example.com', token: 'tok' },
    log: (msg) => logs.push(msg),
    warn: (msg) => warns.push(msg),
    logs,
    warns,
    ...overrides,
  };
}

beforeEach(() => {
  mockedExeca.mockReset();
  mockedUnlink.mockReset();
  fetchMock.mockReset();
});

describe('computeWorktreePath', () => {
  it('returns sibling directory named <basename>-<KEY>', () => {
    expect(computeWorktreePath('/home/u/Repos/Recipes-App', 'KAN-23')).toBe(
      '/home/u/Repos/Recipes-App-KAN-23',
    );
  });

  it('handles repo paths with trailing slashes', () => {
    expect(computeWorktreePath('/home/u/Repos/Recipes-App/', 'KAN-23')).toBe(
      '/home/u/Repos/Recipes-App-KAN-23',
    );
  });
});

describe('isInsideWorktree', () => {
  const wt = '/home/u/Repos/Recipes-App-KAN-23';

  it('true when cwd equals worktree', () => {
    expect(isInsideWorktree(wt, wt)).toBe(true);
  });

  it('true when cwd is a subdirectory of worktree', () => {
    expect(isInsideWorktree(`${wt}/packages`, wt)).toBe(true);
  });

  it('false for the parent repo path', () => {
    expect(isInsideWorktree('/home/u/Repos/Recipes-App', wt)).toBe(false);
  });

  it('false for a sibling that shares a prefix', () => {
    // /home/u/Repos/Recipes-App-KAN-23-other should NOT be inside KAN-23
    expect(isInsideWorktree('/home/u/Repos/Recipes-App-KAN-23-other', wt)).toBe(false);
  });
});

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function noContent() {
  return {
    ok: true,
    status: 204,
    json: async () => ({}),
    text: async () => '',
  } as Response;
}

/**
 * Stage execa responses for a happy-path finish run. Order matters:
 *   1. gh pr list --head <KEY>
 *   2. git worktree list --porcelain
 *   3. git status --porcelain (in worktree)
 *   4. docker compose down -v
 *   5. git worktree remove
 *   6. git branch -D
 *   7. git push origin --delete
 *   8. git fetch --prune origin
 */
function mockHappyPathExeca(
  opts: {
    prState?: string;
    worktreeRegistered?: boolean;
    worktreeDirty?: boolean;
  } = {},
) {
  const prState = opts.prState ?? 'MERGED';
  const worktreeRegistered = opts.worktreeRegistered ?? true;
  const worktreeDirty = opts.worktreeDirty ?? false;

  // 1. gh pr list
  mockedExeca.mockResolvedValueOnce({
    stdout: JSON.stringify([{ number: 42, state: prState }]),
  } as never);

  // 2. git worktree list
  const worktreeListStdout = worktreeRegistered
    ? `worktree /home/u/Repos/Recipes-App\nHEAD abc\nbranch refs/heads/main\n\nworktree /home/u/Repos/Recipes-App-KAN-23\nHEAD def\nbranch refs/heads/KAN-23\n`
    : `worktree /home/u/Repos/Recipes-App\nHEAD abc\nbranch refs/heads/main\n`;
  mockedExeca.mockResolvedValueOnce({ stdout: worktreeListStdout } as never);

  // 3. git status --porcelain (only called if worktree registered)
  if (worktreeRegistered) {
    mockedExeca.mockResolvedValueOnce({
      stdout: worktreeDirty ? ' M packages/cli/src/index.ts\n' : '',
    } as never);
  }

  // 4-8. cleanup steps — default to success
  if (worktreeRegistered) {
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never); // docker compose down
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never); // git worktree remove
  }
  mockedExeca.mockResolvedValueOnce({ stdout: '' } as never); // git branch -D
  mockedExeca.mockResolvedValueOnce({ stdout: '' } as never); // git push origin --delete
  mockedExeca.mockResolvedValueOnce({ stdout: '' } as never); // git fetch --prune
}

describe('runFinish refusals', () => {
  it('refuses when cwd is inside the worktree being removed', async () => {
    const deps = makeDeps({ cwd: '/home/u/Repos/Recipes-App-KAN-23/packages' });
    const result = await runFinish('KAN-23', deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/inside the worktree/i);
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('refuses when no PR exists for the branch', async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: '[]' } as never);
    const deps = makeDeps();
    const result = await runFinish('KAN-23', deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no PR/i);
  });

  it('refuses when PR is not merged', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([{ number: 42, state: 'OPEN' }]),
    } as never);
    const deps = makeDeps();
    const result = await runFinish('KAN-23', deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/OPEN/);
  });

  it('refuses when worktree has uncommitted changes', async () => {
    mockHappyPathExeca({ worktreeDirty: true });
    const deps = makeDeps();
    const result = await runFinish('KAN-23', deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/uncommitted/i);
  });
});

describe('runFinish happy path', () => {
  it('runs all cleanup steps and transitions Jira to Done', async () => {
    mockHappyPathExeca();

    // Jira: getIssue returns "In Progress", getTransitions returns Done, transition succeeds
    fetchMock.mockResolvedValueOnce(
      ok({ key: 'KAN-23', fields: { status: { name: 'In Progress' } } }),
    );
    fetchMock.mockResolvedValueOnce(
      ok({ transitions: [{ id: '31', name: 'Done', to: { name: 'Done' } }] }),
    );
    fetchMock.mockResolvedValueOnce(noContent());

    mockedUnlink.mockResolvedValue(undefined);

    const deps = makeDeps();
    const result = await runFinish('KAN-23', deps);

    expect(result.ok).toBe(true);

    // Verify the right git/docker/gh commands ran with correct cwd
    const calls = mockedExeca.mock.calls.map((c) => ({ cmd: c[0], args: c[1] }));
    expect(calls[0]).toMatchObject({
      cmd: 'gh',
      args: expect.arrayContaining(['pr', 'list', '--head', 'KAN-23']),
    });
    // worktree list, status, docker, worktree remove, branch -D, push --delete, fetch
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cmd: 'docker',
          args: expect.arrayContaining(['compose', 'down', '-v']),
        }),
        expect.objectContaining({
          cmd: 'git',
          args: expect.arrayContaining(['worktree', 'remove']),
        }),
        expect.objectContaining({
          cmd: 'git',
          args: expect.arrayContaining(['branch', '-D', 'KAN-23']),
        }),
        expect.objectContaining({
          cmd: 'git',
          args: expect.arrayContaining(['push', 'origin', '--delete', 'KAN-23']),
        }),
        expect.objectContaining({
          cmd: 'git',
          args: expect.arrayContaining(['fetch', '--prune', 'origin']),
        }),
      ]),
    );

    // Jira PUT was called
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const transitionCall = fetchMock.mock.calls[2]!;
    expect(transitionCall[0]).toBe(
      'https://safturento.atlassian.net/rest/api/3/issue/KAN-23/transitions',
    );
    expect((transitionCall[1] as RequestInit).method).toBe('POST');

    // /tmp logs unlinked
    expect(mockedUnlink).toHaveBeenCalledWith('/tmp/crew-run-KAN-23.log');
    expect(mockedUnlink).toHaveBeenCalledWith('/tmp/crew-fix-pr-KAN-23.log');

    // Every successful step logged a checkmark
    expect(deps.logs.length).toBeGreaterThan(0);
    expect(deps.warns).toEqual([]);
  });

  it('skips worktree-only steps idempotently when worktree is already gone', async () => {
    mockHappyPathExeca({ worktreeRegistered: false });

    fetchMock.mockResolvedValueOnce(ok({ key: 'KAN-23', fields: { status: { name: 'Done' } } }));

    mockedUnlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const deps = makeDeps();
    const result = await runFinish('KAN-23', deps);

    expect(result.ok).toBe(true);
    // No docker / no worktree remove call
    const calls = mockedExeca.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('docker');
    // /tmp warns are fine — files just didn't exist
    expect(deps.warns.some((w) => /\/tmp\/crew-run-KAN-23\.log/.test(w))).toBe(true);
  });

  it('warns and continues when no jira secrets configured', async () => {
    mockHappyPathExeca();
    mockedUnlink.mockResolvedValue(undefined);

    const deps = makeDeps({ jiraSecrets: null });
    const result = await runFinish('KAN-23', deps);

    expect(result.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deps.warns.some((w) => /jira/i.test(w))).toBe(true);
  });

  it('warns but does not fail when push --delete fails (already deleted)', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([{ number: 42, state: 'MERGED' }]),
    } as never);
    mockedExeca.mockResolvedValueOnce({
      stdout: 'worktree /home/u/Repos/Recipes-App-KAN-23\nbranch refs/heads/KAN-23\n',
    } as never);
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never); // status clean
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never); // docker compose down
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never); // worktree remove
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never); // branch -D
    mockedExeca.mockRejectedValueOnce(new Error('remote ref does not exist')); // push --delete
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never); // fetch

    fetchMock.mockResolvedValueOnce(
      ok({ key: 'KAN-23', fields: { status: { name: 'In Progress' } } }),
    );
    fetchMock.mockResolvedValueOnce(
      ok({ transitions: [{ id: '31', name: 'Done', to: { name: 'Done' } }] }),
    );
    fetchMock.mockResolvedValueOnce(noContent());
    mockedUnlink.mockResolvedValue(undefined);

    const deps = makeDeps();
    const result = await runFinish('KAN-23', deps);

    expect(result.ok).toBe(true);
    expect(deps.warns.some((w) => /push origin --delete/.test(w))).toBe(true);
  });

  it('skips Jira transition when issue is already Done', async () => {
    mockHappyPathExeca();
    fetchMock.mockResolvedValueOnce(ok({ key: 'KAN-23', fields: { status: { name: 'Done' } } }));
    mockedUnlink.mockResolvedValue(undefined);

    const deps = makeDeps();
    const result = await runFinish('KAN-23', deps);

    expect(result.ok).toBe(true);
    // Only the getIssue call happened — no getTransitions, no transition POST
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(deps.logs.some((l) => /already Done/i.test(l))).toBe(true);
  });
});
