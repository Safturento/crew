import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectConfig } from 'crew-shared';

vi.mock('../lib/sessions/cleanup.js', () => ({
  deleteSessionsForWorktree: vi.fn(),
}));
vi.mock('../lib/run/cleanup-worktree.js', () => ({
  removeWorktreeAndBranch: vi.fn(),
}));
vi.mock('../lib/discover-project-config.js', () => ({
  discoverProjectConfig: vi.fn(
    async () =>
      ({
        name: 'test',
        repo_path: '/repo',
        default_branch: 'main',
        jira: { project_key: 'X', site: 'https://x.atlassian.net' },
        github: { repo: 'a/b' },
      }) as unknown as ProjectConfig,
  ),
}));

import { deleteSessionsForWorktree } from '../lib/sessions/cleanup.js';
import { removeWorktreeAndBranch } from '../lib/run/cleanup-worktree.js';
import { runReset } from './reset.js';

const sessionsMock = vi.mocked(deleteSessionsForWorktree);
const worktreeMock = vi.mocked(removeWorktreeAndBranch);

describe('runReset', () => {
  let logs: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    logSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string) => {
      logs.push(String(chunk));
      return true;
    }) as never);
    sessionsMock.mockReset();
    worktreeMock.mockReset();
  });

  afterEach(() => logSpy.mockRestore());

  it('default: deletes sessions only and reports the count', async () => {
    sessionsMock.mockReturnValue({ deletedCount: 3, dirExisted: true });

    await runReset('KAN-1', { hard: false });

    expect(sessionsMock).toHaveBeenCalledTimes(1);
    expect(worktreeMock).not.toHaveBeenCalled();
    expect(logs.join('')).toMatch(/3 session/);
  });

  it('default: handles "no sessions" gracefully', async () => {
    sessionsMock.mockReturnValue({ deletedCount: 0, dirExisted: false });
    await runReset('KAN-1', { hard: false });
    expect(logs.join('')).toMatch(/no sessions to delete/);
  });

  it('--hard removed: deletes sessions, worktree, and branch', async () => {
    sessionsMock.mockReturnValue({ deletedCount: 2, dirExisted: true });
    worktreeMock.mockResolvedValue({ worktree: 'removed', branch: 'removed' });

    await runReset('KAN-1', { hard: true });

    expect(sessionsMock).toHaveBeenCalledTimes(1);
    expect(worktreeMock).toHaveBeenCalledTimes(1);
    expect(worktreeMock).toHaveBeenCalledWith(expect.objectContaining({ repoPath: '/repo' }));
    const out = logs.join('');
    expect(out).toMatch(/2 session/);
    expect(out).toMatch(/worktree removed:/);
    expect(out).toMatch(/branch removed: KAN-1/);
  });

  it('--hard notFound: reports neither worktree nor branch was present', async () => {
    sessionsMock.mockReturnValue({ deletedCount: 0, dirExisted: false });
    worktreeMock.mockResolvedValue({ worktree: 'notFound', branch: 'notFound' });

    await runReset('KAN-1', { hard: true });

    const out = logs.join('');
    expect(out).toMatch(/worktree not present:/);
    expect(out).toMatch(/branch not present: KAN-1/);
  });

  it('--hard orphanCleaned: surfaces both the recovery action and the underlying git error', async () => {
    sessionsMock.mockReturnValue({ deletedCount: 0, dirExisted: false });
    worktreeMock.mockResolvedValue({
      worktree: 'orphanCleaned',
      worktreeError: "fatal: '/r/x' is not a working tree",
      branch: 'notFound',
    });

    await runReset('KAN-1', { hard: true });

    const out = logs.join('');
    expect(out).toMatch(/git admin was missing; removed orphaned directory:/);
    expect(out).toMatch(/git error: fatal: '\/r\/x' is not a working tree/);
  });

  it('--hard failed worktree: surfaces the underlying error', async () => {
    sessionsMock.mockReturnValue({ deletedCount: 0, dirExisted: true });
    worktreeMock.mockResolvedValue({
      worktree: 'failed',
      worktreeError: 'EACCES: permission denied',
      branch: 'notFound',
    });

    await runReset('KAN-1', { hard: true });

    const out = logs.join('');
    expect(out).toMatch(/worktree removal failed:/);
    expect(out).toMatch(/error: EACCES: permission denied/);
  });

  it('--hard failed branch: surfaces the underlying error rather than "already removed"', async () => {
    sessionsMock.mockReturnValue({ deletedCount: 0, dirExisted: true });
    worktreeMock.mockResolvedValue({
      worktree: 'removed',
      branch: 'failed',
      branchError: "error: branch 'KAN-1' is currently checked out at /other/worktree",
    });

    await runReset('KAN-1', { hard: true });

    const out = logs.join('');
    expect(out).toMatch(/branch removal failed: KAN-1/);
    expect(out).toMatch(/checked out at \/other\/worktree/);
    expect(out).not.toMatch(/branch already removed/);
  });
});
