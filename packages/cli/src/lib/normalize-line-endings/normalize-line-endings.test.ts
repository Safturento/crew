import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNormalizeLineEndings } from './index.js';

// These tests run against real git repositories on purpose: the value of this
// command is precisely its interaction with git's smudge / checkout-index
// machinery, which mocks cannot exercise faithfully (see ticket CREW-32).

let repo: string;
let logs: string[];
let warns: string[];

async function git(...args: string[]): Promise<void> {
  await execa('git', args, { cwd: repo });
}

function write(rel: string, content: string): void {
  writeFileSync(join(repo, rel), content);
}

function read(rel: string): string {
  return readFileSync(join(repo, rel), 'utf8');
}

function deps() {
  return {
    cwd: repo,
    log: (msg: string) => logs.push(msg),
    warn: (msg: string) => warns.push(msg),
  };
}

beforeEach(async () => {
  repo = mkdtempSync(join(tmpdir(), 'crew-nle-'));
  logs = [];
  warns = [];
  await git('init', '-q');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test');
  await git('config', 'commit.gpgsign', 'false');
  await git('config', 'core.autocrlf', 'false');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('runNormalizeLineEndings', () => {
  it('is a no-op on an already-LF repo', async () => {
    write('.gitattributes', '* text=auto eol=lf\n');
    write('a.txt', 'one\ntwo\nthree\n');
    await git('add', '.');
    await git('commit', '-qm', 'init');

    const result = await runNormalizeLineEndings(deps());

    expect(result.status).toBe('noop');
    expect(result.beforeCount).toBe(0);
    expect(logs.join('\n')).toContain('No CRLF working-tree files found.');
  });

  it('normalizes CRLF working files in a single pass when .gitattributes drives the smudge', async () => {
    // Index is LF-normalized; only the working copy is CRLF. checkout-index's
    // eol=lf smudge rewrites it to LF (pass 1 is sufficient).
    write('.gitattributes', '*.txt text eol=lf\n');
    write('a.txt', 'one\ntwo\nthree\n');
    await git('add', '.');
    await git('commit', '-qm', 'init');
    write('a.txt', 'one\r\ntwo\r\nthree\r\n');

    const result = await runNormalizeLineEndings(deps());

    expect(result.status).toBe('normalized');
    expect(result.beforeCount).toBe(1);
    expect(result.afterPass1Count).toBe(0);
    expect(result.afterCount).toBe(0);
    expect(read('a.txt')).toBe('one\ntwo\nthree\n');
  });

  it('falls back to the sed pass when checkout-index leaves CRLF in place', async () => {
    // No text attribute + autocrlf=false: the CRLF bytes are stored verbatim
    // in the index, so checkout-index reproduces them unchanged. Pass 2 must
    // strip the CR, and the resulting LF must land staged in the index.
    write('a.txt', 'one\r\ntwo\r\nthree\r\n');
    await git('add', 'a.txt');
    await git('commit', '-qm', 'init');

    const result = await runNormalizeLineEndings(deps());

    expect(result.status).toBe('normalized');
    expect(result.beforeCount).toBe(1);
    expect(result.afterPass1Count).toBe(1);
    expect(result.afterCount).toBe(0);
    expect(result.indexHasChanges).toBe(true);
    expect(read('a.txt')).toBe('one\ntwo\nthree\n');
    expect(logs.join('\n')).toContain('git commit -m "chore: normalize line endings to LF"');
  });

  it('refuses to run on a dirty working tree', async () => {
    write('.gitattributes', '* text=auto eol=lf\n');
    write('a.txt', 'one\ntwo\n');
    await git('add', '.');
    await git('commit', '-qm', 'init');
    write('a.txt', 'one\ntwo\nthree\n'); // uncommitted change

    const result = await runNormalizeLineEndings(deps());

    expect(result.status).toBe('dirty');
    expect(result.reason).toMatch(/uncommitted/i);
    expect(read('a.txt')).toBe('one\ntwo\nthree\n'); // untouched
  });
});
