import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));
import { execa } from 'execa';
import { convergeGitExclude, DISPATCH_EXCLUDE_ENTRIES } from './converge-git-exclude.js';

const execaMock = vi.mocked(execa);

/** A throwaway worktree dir whose `.git/info/exclude` the helper converges. */
function makeWorktree(): string {
  return mkdtempSync(join(tmpdir(), 'crew-cge-'));
}

/** Mock `git rev-parse --git-common-dir` to point at `<worktree>/<gitCommonDir>`. */
function mockCommonDir(gitCommonDir: string): void {
  execaMock.mockReturnValueOnce(
    Promise.resolve({ exitCode: 0, stdout: gitCommonDir, stderr: '' }) as ReturnType<typeof execa>,
  );
}

function readExclude(worktree: string, gitCommonDir = '.git'): string {
  return readFileSync(join(worktree, gitCommonDir, 'info', 'exclude'), 'utf8');
}

describe('convergeGitExclude', () => {
  beforeEach(() => execaMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('resolves the exclude file via `git rev-parse --git-common-dir`, not --git-dir', async () => {
    const worktree = makeWorktree();
    mockCommonDir('.git');

    await convergeGitExclude({ worktree, log: () => {}, warn: () => {} });

    expect(execaMock).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--git-common-dir'],
      expect.objectContaining({ cwd: worktree }),
    );
  });

  it('creates info/exclude (and its info/ dir) with all three entries when absent', async () => {
    const worktree = makeWorktree();
    mockCommonDir('.git');

    const result = await convergeGitExclude({ worktree, log: () => {}, warn: () => {} });

    expect(result).toEqual({
      kind: 'converged',
      excludePath: join(worktree, '.git', 'info', 'exclude'),
      added: [...DISPATCH_EXCLUDE_ENTRIES],
    });
    const lines = readExclude(worktree).split('\n');
    for (const entry of DISPATCH_EXCLUDE_ENTRIES) {
      expect(lines).toContain(entry);
    }
  });

  it('is dedup-aware — a re-run appends nothing and leaves no duplicate lines', async () => {
    const worktree = makeWorktree();
    mockCommonDir('.git');
    await convergeGitExclude({ worktree, log: () => {}, warn: () => {} });

    mockCommonDir('.git');
    const second = await convergeGitExclude({ worktree, log: () => {}, warn: () => {} });

    expect(second).toMatchObject({ kind: 'converged', added: [] });
    const content = readExclude(worktree);
    for (const entry of DISPATCH_EXCLUDE_ENTRIES) {
      const occurrences = content.split('\n').filter((l) => l.trim() === entry).length;
      expect(occurrences).toBe(1);
    }
  });

  it('append-merges without clobbering an existing exclude file', async () => {
    const worktree = makeWorktree();
    const infoDir = join(worktree, '.git', 'info');
    mkdirSync(infoDir, { recursive: true });
    // Baseline exclude with content and no trailing newline.
    writeFileSync(join(infoDir, 'exclude'), '# git ls-files --others\n*.log', 'utf8');
    mockCommonDir('.git');

    await convergeGitExclude({ worktree, log: () => {}, warn: () => {} });

    const content = readExclude(worktree);
    expect(content).toContain('# git ls-files --others');
    expect(content).toContain('*.log');
    for (const entry of DISPATCH_EXCLUDE_ENTRIES) {
      expect(content).toContain(entry);
    }
    // A separating newline was inserted before the appended block.
    expect(content).toContain('*.log\n.claude/skills/');
  });

  it('only appends the entries that are missing, preserving user-added ones', async () => {
    const worktree = makeWorktree();
    const infoDir = join(worktree, '.git', 'info');
    mkdirSync(infoDir, { recursive: true });
    writeFileSync(join(infoDir, 'exclude'), '.claude/skills/\n', 'utf8');
    mockCommonDir('.git');

    const result = await convergeGitExclude({ worktree, log: () => {}, warn: () => {} });

    expect(result).toMatchObject({
      kind: 'converged',
      added: ['.claude/crew-hooks/', '.claude/settings.local.json'],
    });
    const skillsLines = readExclude(worktree)
      .split('\n')
      .filter((l) => l.trim() === '.claude/skills/');
    expect(skillsLines).toHaveLength(1);
  });

  it('resolves a linked-worktree common dir that lives outside the worktree', async () => {
    const worktree = makeWorktree();
    // Simulate a shared common git dir a sibling of the worktree.
    const sharedGit = mkdtempSync(join(tmpdir(), 'crew-cge-shared-'));
    mockCommonDir(sharedGit); // absolute path — resolve() should keep it verbatim

    const result = await convergeGitExclude({ worktree, log: () => {}, warn: () => {} });

    expect(result).toMatchObject({
      kind: 'converged',
      excludePath: join(sharedGit, 'info', 'exclude'),
    });
    expect(existsSync(join(sharedGit, 'info', 'exclude'))).toBe(true);
  });

  it('returns a warning (never throws) when the exclude write fails', async () => {
    const worktree = makeWorktree();
    // Point the common dir at a *file*, so mkdir/write of `<file>/info/exclude`
    // throws ENOTDIR — the fs-failure branch, distinct from the rev-parse one.
    const notADir = join(worktree, 'not-a-dir');
    writeFileSync(notADir, 'x', 'utf8');
    mockCommonDir(notADir);
    const warn = vi.fn();

    const result = await convergeGitExclude({ worktree, log: () => {}, warn });

    expect(result.kind).toBe('warning');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed to write'));
  });

  it('returns a warning (never throws) when git rev-parse fails', async () => {
    const worktree = makeWorktree();
    execaMock.mockReturnValueOnce(
      Promise.resolve({
        exitCode: 128,
        stdout: '',
        stderr: 'fatal: not a git repository',
      }) as ReturnType<typeof execa>,
    );
    const warn = vi.fn();

    const result = await convergeGitExclude({ worktree, log: () => {}, warn });

    expect(result.kind).toBe('warning');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a git repository'));
  });
});
