import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeWorktreeProjectPath, findLatestSession } from './index.js';

describe('encodeWorktreeProjectPath', () => {
  it('replaces every / with - and prefixes a single - for the leading slash', () => {
    expect(encodeWorktreeProjectPath('/home/safturento/Repos/Recipes-App-KAN-23')).toBe(
      '-home-safturento-Repos-Recipes-App-KAN-23',
    );
  });

  it('handles paths with multiple consecutive slashes by treating each as -', () => {
    expect(encodeWorktreeProjectPath('/a/b/c')).toBe('-a-b-c');
  });
});

describe('findLatestSession', () => {
  let tmp: string;
  let projectsDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'crew-sessions-'));
    projectsDir = join(tmp, 'projects');
    mkdirSync(projectsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns null when no project folder exists for the worktree', () => {
    expect(findLatestSession({ worktree: '/no/such/path', projectsRoot: projectsDir })).toBeNull();
  });

  it('returns null when the project folder has no JSONL files', () => {
    const worktree = '/home/u/repo';
    const dir = join(projectsDir, encodeWorktreeProjectPath(worktree));
    mkdirSync(dir);

    expect(findLatestSession({ worktree, projectsRoot: projectsDir })).toBeNull();
  });

  it('returns the most recently modified JSONL with sessionId derived from filename', () => {
    const worktree = '/home/u/repo';
    const dir = join(projectsDir, encodeWorktreeProjectPath(worktree));
    mkdirSync(dir);

    const older = join(dir, 'aaa-1111.jsonl');
    const newer = join(dir, 'bbb-2222.jsonl');
    writeFileSync(older, '');
    writeFileSync(newer, '');
    const past = new Date('2024-01-01T00:00:00Z');
    utimesSync(older, past, past);

    const result = findLatestSession({ worktree, projectsRoot: projectsDir });

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe('bbb-2222');
    expect(result?.transcriptPath).toBe(newer);
  });
});
