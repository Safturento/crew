import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeWorktreeProjectPath } from './index.js';
import { deleteSessionsForWorktree } from './cleanup.js';

describe('deleteSessionsForWorktree', () => {
  let projectsRoot: string;
  let worktree: string;

  beforeEach(() => {
    projectsRoot = join(tmpdir(), `crew-cleanup-test-${process.pid}-${Date.now()}`);
    worktree = '/some/worktree';
    mkdirSync(projectsRoot, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(projectsRoot)) rmSync(projectsRoot, { recursive: true, force: true });
  });

  function projectDir(): string {
    return join(projectsRoot, encodeWorktreeProjectPath(worktree));
  }

  it('returns 0 and does not error when the project dir does not exist', () => {
    const result = deleteSessionsForWorktree({ worktree, projectsRoot });
    expect(result.deletedCount).toBe(0);
    expect(result.dirExisted).toBe(false);
  });

  it('returns 0 when the project dir exists but has no .jsonl files', () => {
    mkdirSync(projectDir(), { recursive: true });
    writeFileSync(join(projectDir(), 'README.txt'), 'not a transcript');
    const result = deleteSessionsForWorktree({ worktree, projectsRoot });
    expect(result.deletedCount).toBe(0);
    expect(result.dirExisted).toBe(true);
    expect(existsSync(join(projectDir(), 'README.txt'))).toBe(true);
  });

  it('deletes every .jsonl file and returns the count', () => {
    mkdirSync(projectDir(), { recursive: true });
    writeFileSync(join(projectDir(), 'aaa.jsonl'), '{}');
    writeFileSync(join(projectDir(), 'bbb.jsonl'), '{}');
    writeFileSync(join(projectDir(), 'ccc.jsonl'), '{}');
    writeFileSync(join(projectDir(), 'README.txt'), 'keep me');

    const result = deleteSessionsForWorktree({ worktree, projectsRoot });
    expect(result.deletedCount).toBe(3);
    expect(result.dirExisted).toBe(true);
    expect(readdirSync(projectDir())).toEqual(['README.txt']);
  });
});
