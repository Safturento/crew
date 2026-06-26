import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { githubAuthPresent } from './github-auth-present.js';
import type { HealthContext } from '../types.js';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'crew-ghauth-check-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** A worktree with a populated per-repo gh-token. */
function worktreeWithToken(): string {
  const worktree = tmp();
  const dir = join(worktree, '.claude', 'secrets');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'gh-token'), 'github_pat_x');
  return worktree;
}

/** A fake home dir whose ~/.claude.json declares a GitHub-targeting MCP server. */
function homeWithGithubMcp(): string {
  const home = tmp();
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({ mcpServers: { github: { command: 'docker' } } }),
  );
  return home;
}

describe('github-auth-present', () => {
  it('is a project-scoped check with a fix', () => {
    expect(githubAuthPresent.scope).toBe('project');
    expect(typeof githubAuthPresent.fix).toBe('function');
  });

  it('ok when a repo token is present (clean home, no MCP)', async () => {
    const r = await githubAuthPresent.detect({
      worktree: worktreeWithToken(),
      homeDir: tmp(),
    } as HealthContext);
    expect(r.status).toBe('ok');
    expect(r.headline).toMatch(/token/i);
  });

  it('ok via a user-level GitHub MCP even with no repo token', async () => {
    const r = await githubAuthPresent.detect({
      worktree: tmp(),
      homeDir: homeWithGithubMcp(),
    } as HealthContext);
    expect(r.status).toBe('ok');
    expect(r.headline).toMatch(/MCP/i);
  });

  it('fail (fixable) when neither channel is present', async () => {
    const r = await githubAuthPresent.detect({
      worktree: tmp(),
      homeDir: tmp(), // clean home → no GitHub MCP, hermetic regardless of CI config
    } as HealthContext);
    expect(r.status).toBe('fail');
    expect(r.fixable).toBe(true);
    expect(r.remediation).toMatch(/MCP|PAT/);
  });

  it('fix() scaffolds the optional token slot but stays red without a credential', async () => {
    const worktree = tmp();
    const ctx = { worktree, homeDir: tmp() } as HealthContext;
    await githubAuthPresent.fix!(ctx);
    // path/perms/gitignore scaffolded, but no real credential supplied → still fail
    expect((await githubAuthPresent.detect(ctx)).status).toBe('fail');
  });
});
