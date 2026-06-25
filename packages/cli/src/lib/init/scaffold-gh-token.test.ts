import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldGhToken } from './scaffold-gh-token.js';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'crew-ghtoken-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const tokenPathOf = (repo: string) => join(repo, '.claude', 'secrets', 'gh-token');
const gitignoreOf = (repo: string) => join(repo, '.gitignore');

describe('scaffoldGhToken', () => {
  it('creates an empty 0600 placeholder and gitignores .claude/secrets/ on a bare repo', () => {
    const repo = tmp();
    const r = scaffoldGhToken(repo);

    const tokenPath = tokenPathOf(repo);
    expect(existsSync(tokenPath)).toBe(true);
    expect(readFileSync(tokenPath, 'utf8')).toBe('');
    // mode bits (mask the file-type bits)
    expect(statSync(tokenPath).mode & 0o777).toBe(0o600);

    expect(readFileSync(gitignoreOf(repo), 'utf8')).toContain('.claude/secrets/');

    expect(r.tokenPath).toBe(tokenPath);
    expect(r.needsToken).toBe(true);
    expect(r.written).toContain(tokenPath);
    expect(r.written).toContain(gitignoreOf(repo));
  });

  it('never clobbers an existing non-empty token and reports needsToken=false', () => {
    const repo = tmp();
    const tokenPath = tokenPathOf(repo);
    // pre-seed a "real" token
    scaffoldGhToken(repo); // create the dir structure first
    writeFileSync(tokenPath, 'github_pat_REAL\n', 'utf8');

    const r = scaffoldGhToken(repo);

    expect(readFileSync(tokenPath, 'utf8')).toBe('github_pat_REAL\n'); // untouched
    expect(r.needsToken).toBe(false);
    expect(r.written).not.toContain(tokenPath);
  });

  it('appends the gitignore entry idempotently, preserving a baseline .gitignore', () => {
    const repo = tmp();
    writeFileSync(gitignoreOf(repo), 'node_modules\n.env\n', 'utf8');

    scaffoldGhToken(repo);
    const afterFirst = readFileSync(gitignoreOf(repo), 'utf8');
    expect(afterFirst).toContain('node_modules');
    expect(afterFirst).toContain('.env');
    expect(afterFirst).toContain('.claude/secrets/');
    // baseline preserved, entry appended exactly once
    expect(afterFirst.match(/\.claude\/secrets\//g)).toHaveLength(1);

    const r2 = scaffoldGhToken(repo);
    const afterSecond = readFileSync(gitignoreOf(repo), 'utf8');
    expect(afterSecond).toBe(afterFirst); // no duplicate line
    expect(r2.written).not.toContain(gitignoreOf(repo));
  });

  it('treats a trailing-slash-less .claude/secrets entry as already ignored', () => {
    const repo = tmp();
    writeFileSync(gitignoreOf(repo), '.claude/secrets\n', 'utf8');

    const r = scaffoldGhToken(repo);
    expect(readFileSync(gitignoreOf(repo), 'utf8')).toBe('.claude/secrets\n'); // untouched
    expect(r.written).not.toContain(gitignoreOf(repo));
  });
});
