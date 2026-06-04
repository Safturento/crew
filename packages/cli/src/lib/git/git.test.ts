import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import {
  hasUncommittedChanges,
  isMidRebase,
  getHeadSha,
  resolveWorktreePath,
  parseLsFilesEol,
} from './index.js';

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

describe('isMidRebase', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'crew-isrebase-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns true when .git/rebase-merge exists', async () => {
    mkdirSync(join(tmp, '.git', 'rebase-merge'), { recursive: true });
    ok('.git/rebase-merge\n');
    expect(await isMidRebase(tmp)).toBe(true);
  });

  it('returns true when .git/rebase-apply exists', async () => {
    mkdirSync(join(tmp, '.git', 'rebase-apply'), { recursive: true });
    ok('.git/rebase-merge\n');
    ok('.git/rebase-apply\n');
    expect(await isMidRebase(tmp)).toBe(true);
  });

  it('returns false when neither rebase directory exists', async () => {
    ok('.git/rebase-merge\n');
    ok('.git/rebase-apply\n');
    expect(await isMidRebase(tmp)).toBe(false);
  });
});

describe('getHeadSha', () => {
  it('returns the trimmed HEAD sha', async () => {
    ok('abc123\n');
    expect(await getHeadSha('/wt')).toBe('abc123');
    expect(mockedExeca).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD'], { cwd: '/wt' });
  });
});

describe('parseLsFilesEol', () => {
  it('returns only paths whose working-tree representation is CRLF', () => {
    const output = [
      'i/lf    w/lf    attr/                 \t.gitattributes',
      'i/lf    w/crlf  attr/text eol=lf      \tsrc/app.ts',
      'i/crlf  w/crlf  attr/                 \tscripts/build.sh',
      'i/-text w/-text attr/                 \tassets/logo.png',
    ].join('\n');
    expect(parseLsFilesEol(output)).toEqual(['src/app.ts', 'scripts/build.sh']);
  });

  it('returns an empty array for all-LF output', () => {
    const output = [
      'i/lf    w/lf    attr/                 \tREADME.md',
      'i/lf    w/lf    attr/text eol=lf      \tsrc/index.ts',
    ].join('\n');
    expect(parseLsFilesEol(output)).toEqual([]);
  });

  it('returns an empty array for empty output', () => {
    expect(parseLsFilesEol('')).toEqual([]);
    expect(parseLsFilesEol('\n')).toEqual([]);
  });

  it('preserves paths that contain spaces', () => {
    const output = 'i/lf    w/crlf  attr/text eol=lf      \tmy docs/read me.txt';
    expect(parseLsFilesEol(output)).toEqual(['my docs/read me.txt']);
  });

  it('does not match w/crlf appearing inside a path', () => {
    const output = 'i/lf    w/lf    attr/                 \tsrc/w/crlf-notes.md';
    expect(parseLsFilesEol(output)).toEqual([]);
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
