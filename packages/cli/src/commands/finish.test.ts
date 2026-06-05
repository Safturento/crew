import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execa } from 'execa';
import { readdir, stat, unlink } from 'node:fs/promises';
import {
  computeWorktreePath,
  type FinishDeps,
  isInsideWorktree,
  pruneSandboxStubs,
  readJiraSecrets,
  runFinish,
} from './finish.js';
import type {
  CrewDaemonClient,
  DaemonResult,
  ProjectConfig,
  RegisterRunSuccess,
} from '../lib/index.js';

vi.mock('execa', () => ({ execa: vi.fn() }));
vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const mockedExeca = vi.mocked(execa);
const mockedReaddir = vi.mocked(readdir);
const mockedStat = vi.mocked(stat);
const mockedUnlink = vi.mocked(unlink);

interface DaemonClientStub {
  registerRun: ReturnType<typeof vi.fn>;
  completeRun: ReturnType<typeof vi.fn>;
  reportFinishStep: ReturnType<typeof vi.fn>;
}

function makeDaemonClient(
  overrides: Partial<{
    registerResult: DaemonResult<RegisterRunSuccess>;
    completeResult: DaemonResult<{ ok: true }>;
  }> = {},
): DaemonClientStub & Pick<CrewDaemonClient, 'baseUrl'> {
  const registerResult: DaemonResult<RegisterRunSuccess> = overrides.registerResult ?? {
    ok: true,
    agent: {
      key: 'KAN-23',
      projectName: 'recipes-app',
      ticketTitle: '',
      worktreePath: '/home/u/Repos/Recipes-App-KAN-23',
      branch: 'KAN-23',
    },
    run: {
      id: 7,
      agentKey: 'KAN-23',
      command: 'finish',
      sessionId: 'finish-KAN-23-fixed',
      startedAt: '2026-04-29T12:00:00Z',
    },
  };
  const completeResult: DaemonResult<{ ok: true }> = overrides.completeResult ?? { ok: true };
  return {
    baseUrl: 'http://localhost:7773',
    registerRun: vi.fn().mockResolvedValue(registerResult),
    completeRun: vi.fn().mockResolvedValue(completeResult),
    reportFinishStep: vi.fn().mockResolvedValue({ ok: true }),
  };
}

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

function makeDeps(
  overrides: Partial<Omit<FinishDeps, 'daemonClient'>> & {
    daemonClient?: DaemonClientStub & Pick<CrewDaemonClient, 'baseUrl'>;
  } = {},
): FinishDeps & {
  logs: string[];
  warns: string[];
  daemonClient: DaemonClientStub & Pick<CrewDaemonClient, 'baseUrl'>;
} {
  const logs: string[] = [];
  const warns: string[] = [];
  const daemonClient = overrides.daemonClient ?? makeDaemonClient();
  return {
    cwd: '/home/u/Repos/Recipes-App',
    config: sampleConfig,
    jiraSecrets: { email: 'me@example.com', token: 'tok' },
    log: (msg) => logs.push(msg),
    warn: (msg) => warns.push(msg),
    logs,
    warns,
    ...overrides,
    daemonClient: daemonClient as unknown as CrewDaemonClient,
  } as FinishDeps & {
    logs: string[];
    warns: string[];
    daemonClient: DaemonClientStub & Pick<CrewDaemonClient, 'baseUrl'>;
  };
}

beforeEach(() => {
  mockedExeca.mockReset();
  mockedReaddir.mockReset();
  mockedStat.mockReset();
  mockedUnlink.mockReset();
  fetchMock.mockReset();
  // Default: empty worktree (no stubs to prune). Individual tests override.
  mockedReaddir.mockResolvedValue([] as never);
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

describe('readJiraSecrets', () => {
  it('returns null when either var is unset', () => {
    expect(readJiraSecrets({})).toBeNull();
    expect(readJiraSecrets({ CREW_JIRA_EMAIL: 'me@x.com' })).toBeNull();
    expect(readJiraSecrets({ CREW_JIRA_API_TOKEN: 'tok' })).toBeNull();
  });

  it('trims surrounding whitespace so CRLF-loaded env files do not break Basic auth', () => {
    const secrets = readJiraSecrets({
      CREW_JIRA_EMAIL: 'me@x.com\r',
      CREW_JIRA_API_TOKEN: '  tok\n',
    });
    expect(secrets).toEqual({ email: 'me@x.com', token: 'tok' });
  });
});

describe('pruneSandboxStubs', () => {
  const wt = '/home/u/Repos/Recipes-App-KAN-23';

  function stubStat(overrides: { size?: number; mode?: number } = {}) {
    return {
      size: overrides.size ?? 0,
      mode: overrides.mode ?? 0o100444, // S_IFREG | 0o444
    } as Awaited<ReturnType<typeof stat>>;
  }

  it('prunes a worktree whose only entries are sandbox stubs', async () => {
    mockedReaddir.mockResolvedValueOnce(['.bashrc', '.gitconfig', '.zshrc'] as never);
    mockedStat.mockResolvedValue(stubStat());
    mockedUnlink.mockResolvedValue(undefined);

    const warns: string[] = [];
    await pruneSandboxStubs(wt, (msg) => warns.push(msg));

    expect(mockedUnlink).toHaveBeenCalledWith(`${wt}/.bashrc`);
    expect(mockedUnlink).toHaveBeenCalledWith(`${wt}/.gitconfig`);
    expect(mockedUnlink).toHaveBeenCalledWith(`${wt}/.zshrc`);
    expect(mockedUnlink).toHaveBeenCalledTimes(3);
    expect(warns).toHaveLength(3);
    expect(warns[0]).toMatch(/\.bashrc/);
  });

  it('prunes only stubs in a mixed worktree, leaving real untracked files alone', async () => {
    mockedReaddir.mockResolvedValueOnce(['.bashrc', 'notes.txt', '.gitconfig'] as never);
    mockedStat.mockResolvedValue(stubStat());
    mockedUnlink.mockResolvedValue(undefined);

    const warns: string[] = [];
    await pruneSandboxStubs(wt, (msg) => warns.push(msg));

    expect(mockedUnlink).toHaveBeenCalledWith(`${wt}/.bashrc`);
    expect(mockedUnlink).toHaveBeenCalledWith(`${wt}/.gitconfig`);
    expect(mockedUnlink).not.toHaveBeenCalledWith(`${wt}/notes.txt`);
    expect(mockedUnlink).toHaveBeenCalledTimes(2);
  });

  it('does nothing when there are no stubs', async () => {
    mockedReaddir.mockResolvedValueOnce(['.git', 'package.json', 'src'] as never);

    const warns: string[] = [];
    await pruneSandboxStubs(wt, (msg) => warns.push(msg));

    expect(mockedUnlink).not.toHaveBeenCalled();
    expect(warns).toEqual([]);
  });

  it('leaves an allowlisted name with non-zero size alone', async () => {
    mockedReaddir.mockResolvedValueOnce(['.gitconfig'] as never);
    mockedStat.mockResolvedValueOnce(stubStat({ size: 200 }));

    const warns: string[] = [];
    await pruneSandboxStubs(wt, (msg) => warns.push(msg));

    expect(mockedUnlink).not.toHaveBeenCalled();
    expect(warns).toEqual([]);
  });

  it('also prunes mode-666 stubs (umask-default sandbox-launcher path)', async () => {
    mockedReaddir.mockResolvedValueOnce(['.bashrc', '.gitconfig'] as never);
    mockedStat.mockResolvedValue(stubStat({ mode: 0o100666 }));
    mockedUnlink.mockResolvedValue(undefined);

    const warns: string[] = [];
    await pruneSandboxStubs(wt, (msg) => warns.push(msg));

    expect(mockedUnlink).toHaveBeenCalledWith(`${wt}/.bashrc`);
    expect(mockedUnlink).toHaveBeenCalledWith(`${wt}/.gitconfig`);
    expect(mockedUnlink).toHaveBeenCalledTimes(2);
  });

  it('leaves an allowlisted name with mode outside the stub set alone', async () => {
    mockedReaddir.mockResolvedValueOnce(['.bashrc'] as never);
    mockedStat.mockResolvedValueOnce(stubStat({ mode: 0o100644 }));

    const warns: string[] = [];
    await pruneSandboxStubs(wt, (msg) => warns.push(msg));

    expect(mockedUnlink).not.toHaveBeenCalled();
    expect(warns).toEqual([]);
  });

  it('leaves a non-allowlisted dotfile alone even if 0-byte and mode 444', async () => {
    mockedReaddir.mockResolvedValueOnce(['.envrc'] as never);
    mockedStat.mockResolvedValueOnce(stubStat());

    const warns: string[] = [];
    await pruneSandboxStubs(wt, (msg) => warns.push(msg));

    expect(mockedUnlink).not.toHaveBeenCalled();
    expect(warns).toEqual([]);
  });

  it('returns silently when the worktree directory cannot be read', async () => {
    mockedReaddir.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const warns: string[] = [];
    await expect(pruneSandboxStubs(wt, (msg) => warns.push(msg))).resolves.toBeUndefined();
    expect(mockedUnlink).not.toHaveBeenCalled();
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

    // Jira call sequence:
    //   1. fetchTicketSummary getIssue (registerRun payload)
    //   2. transitionJira getIssue (current status check)
    //   3. transitionJira getTransitions
    //   4. transitionJira POST /transitions
    fetchMock.mockResolvedValueOnce(
      ok({ key: 'KAN-23', fields: { summary: 'Add board archival endpoint' } }),
    );
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

    // Jira PUT was called (after the title-fetch getIssue + transition-check
    // getIssue + getTransitions, the 4th call is the transition POST).
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const transitionCall = fetchMock.mock.calls[3]!;
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
    // 1. fetchTicketSummary getIssue, 2. transitionJira getIssue (Done).
    fetchMock.mockResolvedValueOnce(
      ok({ key: 'KAN-23', fields: { summary: 'Add board archival endpoint' } }),
    );
    fetchMock.mockResolvedValueOnce(ok({ key: 'KAN-23', fields: { status: { name: 'Done' } } }));
    mockedUnlink.mockResolvedValue(undefined);

    const deps = makeDeps();
    const result = await runFinish('KAN-23', deps);

    expect(result.ok).toBe(true);
    // title-fetch getIssue + transition-check getIssue → no getTransitions, no transition POST.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(deps.logs.some((l) => /already Done/i.test(l))).toBe(true);
  });
});

describe('runFinish daemon round-trips', () => {
  it('registers a finish run with the daemon after gates pass, and completes ok', async () => {
    mockHappyPathExeca();
    // 4-call Jira sequence: title-fetch getIssue, transition-check getIssue,
    // getTransitions, transition POST.
    fetchMock.mockResolvedValueOnce(
      ok({ key: 'KAN-23', fields: { summary: 'Add board archival endpoint' } }),
    );
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

    expect(deps.daemonClient.registerRun).toHaveBeenCalledTimes(1);
    const reg = deps.daemonClient.registerRun.mock.calls[0]![0] as Record<string, unknown>;
    expect(reg).toMatchObject({
      key: 'KAN-23',
      projectName: 'recipes-app',
      branch: 'KAN-23',
      command: 'finish',
      worktreePath: '/home/u/Repos/Recipes-App-KAN-23',
    });
    expect(typeof reg.sessionId).toBe('string');
    expect((reg.sessionId as string).startsWith('finish-KAN-23-')).toBe(true);

    expect(deps.daemonClient.completeRun).toHaveBeenCalledTimes(1);
    expect(deps.daemonClient.completeRun.mock.calls[0]![0]).toBe(7); // runId from stub
    expect(deps.daemonClient.completeRun.mock.calls[0]![1]).toMatchObject({ exitCode: 0 });
  });

  it('does not register the daemon run when a refusal gate trips (no PR)', async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: '[]' } as never);
    const deps = makeDeps();
    const result = await runFinish('KAN-23', deps);

    expect(result.ok).toBe(false);
    expect(deps.daemonClient.registerRun).not.toHaveBeenCalled();
    expect(deps.daemonClient.completeRun).not.toHaveBeenCalled();
  });

  it('continues + exits 0 when registerRun reports daemon unreachable', async () => {
    mockHappyPathExeca();
    // title-fetch getIssue + transition-check getIssue (already Done → no transition).
    fetchMock.mockResolvedValueOnce(
      ok({ key: 'KAN-23', fields: { summary: 'Add board archival endpoint' } }),
    );
    fetchMock.mockResolvedValueOnce(ok({ key: 'KAN-23', fields: { status: { name: 'Done' } } }));
    mockedUnlink.mockResolvedValue(undefined);

    const daemonClient = makeDaemonClient({
      registerResult: { ok: false, reason: 'connect_error' },
    });
    const deps = makeDeps({ daemonClient });
    const result = await runFinish('KAN-23', deps);

    expect(result.ok).toBe(true);
    expect(daemonClient.registerRun).toHaveBeenCalledTimes(1);
    // No runId to complete — completeRun must be skipped to avoid a stray
    // 4xx against the daemon when it comes back up.
    expect(daemonClient.completeRun).not.toHaveBeenCalled();
  });
});

describe('runFinish finish-step emission', () => {
  interface ReportedStep {
    index: number;
    label: string;
    status: 'ok' | 'skip' | 'error';
    detail?: string;
  }

  function reportedSteps(client: DaemonClientStub): ReportedStep[] {
    return client.reportFinishStep.mock.calls.map((call) => {
      const [, payload] = call as [string, ReportedStep & { ts: number }];
      return { index: payload.index, label: payload.label, status: payload.status, detail: payload.detail };
    });
  }

  it('reports each cleanup step as ok with monotonic indices on the happy path', async () => {
    mockHappyPathExeca();
    // title-fetch getIssue + transition-check getIssue (already Done → jira skip).
    fetchMock.mockResolvedValueOnce(
      ok({ key: 'KAN-23', fields: { summary: 'Add board archival endpoint' } }),
    );
    fetchMock.mockResolvedValueOnce(ok({ key: 'KAN-23', fields: { status: { name: 'Done' } } }));
    mockedUnlink.mockResolvedValue(undefined);

    const deps = makeDeps();
    const result = await runFinish('KAN-23', deps);
    expect(result.ok).toBe(true);

    const steps = reportedSteps(deps.daemonClient);
    // Every step targets the agent key.
    for (const call of deps.daemonClient.reportFinishStep.mock.calls) {
      expect(call[0]).toBe('KAN-23');
    }
    // Indices are a contiguous 0..n-1 sequence in emission order.
    expect(steps.map((s) => s.index)).toEqual(steps.map((_, i) => i));

    const byLabel = (re: RegExp) => steps.find((s) => re.test(s.label));
    expect(byLabel(/^docker compose down -v$/)?.status).toBe('ok');
    expect(byLabel(/^git worktree remove /)?.status).toBe('ok');
    expect(byLabel(/^git branch -D KAN-23$/)?.status).toBe('ok');
    expect(byLabel(/^git push origin --delete KAN-23$/)?.status).toBe('ok');
    expect(byLabel(/^git fetch --prune origin$/)?.status).toBe('ok');
  });

  it('reports skipped steps as skip when the worktree is not registered', async () => {
    mockHappyPathExeca({ worktreeRegistered: false });
    fetchMock.mockResolvedValueOnce(
      ok({ key: 'KAN-23', fields: { summary: 'Add board archival endpoint' } }),
    );
    fetchMock.mockResolvedValueOnce(ok({ key: 'KAN-23', fields: { status: { name: 'Done' } } }));
    mockedUnlink.mockResolvedValue(undefined);

    const deps = makeDeps();
    const result = await runFinish('KAN-23', deps);
    expect(result.ok).toBe(true);

    const steps = reportedSteps(deps.daemonClient);
    const skips = steps.filter((s) => s.status === 'skip').map((s) => s.label);
    expect(skips.some((l) => /docker compose down -v/.test(l))).toBe(true);
    expect(skips.some((l) => /git worktree remove/.test(l))).toBe(true);
  });

  it('reports a failing step as error carrying the failure detail', async () => {
    // worktree not registered → skips the worktree teardown; branch -D fails.
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([{ number: 42, state: 'MERGED' }]),
    } as never); // gh pr list
    mockedExeca.mockResolvedValueOnce({
      stdout: `worktree /home/u/Repos/Recipes-App\nHEAD abc\nbranch refs/heads/main\n`,
    } as never); // git worktree list (not registered)
    mockedExeca.mockRejectedValueOnce(new Error('branch not found')); // git branch -D
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never); // git push origin --delete
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never); // git fetch --prune
    fetchMock.mockResolvedValueOnce(
      ok({ key: 'KAN-23', fields: { summary: 'Add board archival endpoint' } }),
    );
    fetchMock.mockResolvedValueOnce(ok({ key: 'KAN-23', fields: { status: { name: 'Done' } } }));
    mockedUnlink.mockResolvedValue(undefined);

    const deps = makeDeps();
    const result = await runFinish('KAN-23', deps);
    expect(result.ok).toBe(true);

    const steps = reportedSteps(deps.daemonClient);
    const branchStep = steps.find((s) => /git branch -D KAN-23/.test(s.label));
    expect(branchStep?.status).toBe('error');
    expect(branchStep?.detail).toContain('branch not found');
  });

  it('does not report finish steps when the daemon is unreachable', async () => {
    mockHappyPathExeca();
    fetchMock.mockResolvedValueOnce(
      ok({ key: 'KAN-23', fields: { summary: 'Add board archival endpoint' } }),
    );
    fetchMock.mockResolvedValueOnce(ok({ key: 'KAN-23', fields: { status: { name: 'Done' } } }));
    mockedUnlink.mockResolvedValue(undefined);

    const daemonClient = makeDaemonClient({
      registerResult: { ok: false, reason: 'connect_error' },
    });
    const deps = makeDeps({ daemonClient });
    const result = await runFinish('KAN-23', deps);
    expect(result.ok).toBe(true);
    expect(daemonClient.reportFinishStep).not.toHaveBeenCalled();
  });
});
