import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execa } from 'execa';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeLineEndingsCommand } from './normalize-line-endings.js';

// Drives the registered Commander command end-to-end against a real git repo,
// standing in for a CLI smoke test (tsx cannot run inside the crew sandbox).

let repo: string;

async function git(...args: string[]): Promise<void> {
  await execa('git', args, { cwd: repo });
}

async function invoke(): Promise<void> {
  // `from: 'user'` so we pass only the subcommand's own argv, not node/script.
  await normalizeLineEndingsCommand.parseAsync([], { from: 'user' });
}

beforeEach(async () => {
  repo = mkdtempSync(join(tmpdir(), 'crew-nle-cmd-'));
  vi.spyOn(process, 'cwd').mockReturnValue(repo);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
  await git('init', '-q');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test');
  await git('config', 'commit.gpgsign', 'false');
  await git('config', 'core.autocrlf', 'false');
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(repo, { recursive: true, force: true });
});

describe('normalize-line-endings command', () => {
  it('normalizes CRLF files and exits without error', async () => {
    writeFileSync(join(repo, 'f.txt'), 'a\r\nb\r\n');
    await git('add', 'f.txt');
    await git('commit', '-qm', 'init');

    await expect(invoke()).resolves.toBeUndefined();
    expect(readFileSync(join(repo, 'f.txt'), 'utf8')).toBe('a\nb\n');
  });

  it('exits non-zero on a dirty working tree', async () => {
    writeFileSync(join(repo, 'f.txt'), 'a\nb\n');
    await git('add', 'f.txt');
    await git('commit', '-qm', 'init');
    writeFileSync(join(repo, 'f.txt'), 'a\nb\nc\n'); // uncommitted

    await expect(invoke()).rejects.toThrow('process.exit(1)');
  });
});
