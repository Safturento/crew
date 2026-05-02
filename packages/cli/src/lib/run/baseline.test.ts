import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execa } from 'execa';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkE2eBaseline, baselineCachePathFor } from './baseline.js';

let workdir: string;
let cacheRoot: string;
let repoPath: string;

async function initRepo(path: string): Promise<string> {
  await execa('git', ['init', '-q', '-b', 'main', path]);
  await execa('git', ['-C', path, 'config', 'user.email', 'test@example.com']);
  await execa('git', ['-C', path, 'config', 'user.name', 'Test']);
  await execa('git', ['-C', path, 'config', 'commit.gpgsign', 'false']);
  writeFileSync(join(path, 'README'), 'one');
  await execa('git', ['-C', path, 'add', 'README']);
  await execa('git', ['-C', path, 'commit', '-q', '-m', 'one']);
  // Simulate origin/main by adding a fake remote tracking ref via update-ref
  const { stdout: sha } = await execa('git', ['-C', path, 'rev-parse', 'HEAD']);
  await execa('git', ['-C', path, 'update-ref', 'refs/remotes/origin/main', sha.trim()]);
  return sha.trim();
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'crew-baseline-'));
  cacheRoot = join(workdir, 'cache');
  repoPath = join(workdir, 'repo');
  mkdirSync(repoPath, { recursive: true });
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe('checkE2eBaseline', () => {
  it('returns green when cache file matches origin/<default> SHA', async () => {
    const sha = await initRepo(repoPath);
    const cachePath = baselineCachePathFor('myproj', cacheRoot);
    mkdirSync(join(cachePath, '..'), { recursive: true });
    writeFileSync(cachePath, `${sha}\n`);

    const result = await checkE2eBaseline({
      projectName: 'myproj',
      repoPath,
      defaultBranch: 'main',
      cacheRoot,
    });
    expect(result).toEqual({ green: true, sha });
  });

  it('returns not-green with reason no-record when cache file is missing', async () => {
    const sha = await initRepo(repoPath);
    const result = await checkE2eBaseline({
      projectName: 'myproj',
      repoPath,
      defaultBranch: 'main',
      cacheRoot,
    });
    expect(result.green).toBe(false);
    if (result.green === false) {
      expect(result.reason).toBe('no-record');
      expect(result.actualSha).toBe(sha);
      expect(result.recordedSha).toBeUndefined();
      expect(result.cachePath).toContain('myproj');
    }
  });

  it('returns not-green with reason mismatch when cache file has stale SHA', async () => {
    const sha = await initRepo(repoPath);
    const cachePath = baselineCachePathFor('myproj', cacheRoot);
    mkdirSync(join(cachePath, '..'), { recursive: true });
    writeFileSync(cachePath, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\n');

    const result = await checkE2eBaseline({
      projectName: 'myproj',
      repoPath,
      defaultBranch: 'main',
      cacheRoot,
    });
    expect(result.green).toBe(false);
    if (result.green === false) {
      expect(result.reason).toBe('mismatch');
      expect(result.actualSha).toBe(sha);
      expect(result.recordedSha).toBe('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    }
  });

  it('returns not-green with reason no-ref when origin/<default> has no ref', async () => {
    await execa('git', ['init', '-q', '-b', 'main', repoPath]);
    await execa('git', ['-C', repoPath, 'config', 'user.email', 'test@example.com']);
    await execa('git', ['-C', repoPath, 'config', 'user.name', 'Test']);
    await execa('git', ['-C', repoPath, 'config', 'commit.gpgsign', 'false']);
    writeFileSync(join(repoPath, 'README'), 'one');
    await execa('git', ['-C', repoPath, 'add', 'README']);
    await execa('git', ['-C', repoPath, 'commit', '-q', '-m', 'one']);

    const result = await checkE2eBaseline({
      projectName: 'myproj',
      repoPath,
      defaultBranch: 'main',
      cacheRoot,
    });
    expect(result.green).toBe(false);
    if (result.green === false) {
      expect(result.reason).toBe('no-ref');
    }
  });
});
