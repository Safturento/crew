import { describe, it, expect } from 'vitest';
import { execaSync } from 'execa';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMcpFile } from './write-mcp-file.js';

function makeRealRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'crew-mcp-test-repo-'));
  execaSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execaSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'],
    {
      cwd: repo,
    },
  );
  return repo;
}

function makeRealWorktree(repo: string): string {
  const wt = mkdtempSync(join(tmpdir(), 'crew-mcp-test-wt-'));
  rmSync(wt, { recursive: true, force: true });
  execaSync('git', ['worktree', 'add', '-q', '--detach', wt], { cwd: repo });
  return wt;
}

describe('writeMcpFile', () => {
  it('writes .mcp.json with the supplied config', async () => {
    const repo = makeRealRepo();
    await writeMcpFile(repo, { appUrl: 'https://localhost:18443' });
    const written = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'));
    expect(written.mcpServers.playwright.env.CREW_APP_URL).toBe('https://localhost:18443');
  });

  it('on a real worktree, writes the exclude line to the main repo .git/info/exclude (not under the worktree)', async () => {
    const repo = makeRealRepo();
    const wt = makeRealWorktree(repo);

    await writeMcpFile(wt, { appUrl: 'http://localhost:5173' });

    const mainExclude = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8');
    expect(mainExclude).toMatch(/^\.mcp\.json$/m);

    // worktree's per-worktree gitdir is a directory under main repo; nothing should be written under it
    const worktreeAdminDir = join(repo, '.git', 'worktrees');
    if (existsSync(worktreeAdminDir)) {
      const worktreeAdminExclude = join(worktreeAdminDir, 'info', 'exclude');
      expect(existsSync(worktreeAdminExclude)).toBe(false);
    }
  });

  it('on a regular checkout, writes to .git/info/exclude in that checkout', async () => {
    const repo = makeRealRepo();
    await writeMcpFile(repo, { appUrl: 'http://localhost:5173' });
    const exclude = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toMatch(/^\.mcp\.json$/m);
  });

  it('is idempotent — second call does not duplicate the exclude line', async () => {
    const repo = makeRealRepo();
    await writeMcpFile(repo, { appUrl: 'http://localhost:5173' });
    await writeMcpFile(repo, { appUrl: 'http://localhost:5173' });
    const exclude = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8');
    const matches = exclude.match(/^\.mcp\.json$/gm) ?? [];
    expect(matches.length).toBe(1);
  });

  it('preserves pre-existing exclude entries', async () => {
    const repo = makeRealRepo();
    writeFileSync(join(repo, '.git', 'info', 'exclude'), 'something-else.txt\n');
    await writeMcpFile(repo, { appUrl: 'http://localhost:5173' });
    const exclude = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toContain('something-else.txt');
    expect(exclude).toMatch(/^\.mcp\.json$/m);
  });

  it('returns { existed: true } when overwriting a pre-existing .mcp.json', async () => {
    const repo = makeRealRepo();
    writeFileSync(join(repo, '.mcp.json'), '{"mcpServers":{}}\n');
    const result = await writeMcpFile(repo, { appUrl: 'http://localhost:5173' });
    expect(result.existed).toBe(true);
    expect(existsSync(join(repo, '.mcp.json'))).toBe(true);
  });
});
