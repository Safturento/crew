import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { ghTokenPresent } from './gh-token-present.js';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'crew-ghtoken-check-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function configFor(worktree: string): ProjectConfig {
  return {
    name: 'acme',
    repo_path: worktree,
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: 'u/r' },
  } as unknown as ProjectConfig;
}

const tokenPathOf = (wt: string) => join(wt, '.claude', 'secrets', 'gh-token');

function seedToken(wt: string, contents: string): void {
  mkdirSync(join(wt, '.claude', 'secrets'), { recursive: true });
  writeFileSync(tokenPathOf(wt), contents, 'utf8');
}

describe('gh-token-present', () => {
  it('is a project-scoped check with a fix', () => {
    expect(ghTokenPresent.scope).toBe('project');
    expect(typeof ghTokenPresent.fix).toBe('function');
  });

  it('ok when a non-empty token is present', async () => {
    const wt = tmp();
    seedToken(wt, 'github_pat_REAL\n');
    const r = await ghTokenPresent.detect({ config: configFor(wt), worktree: wt });
    expect(r.status).toBe('ok');
  });

  it('fails (fixable) when the token file is missing', async () => {
    const wt = tmp();
    const r = await ghTokenPresent.detect({ config: configFor(wt), worktree: wt });
    expect(r.status).toBe('fail');
    expect(r.fixable).toBe(true);
    expect(r.remediation).toMatch(/PAT/i);
  });

  it('fails (fixable) when the token file is present but empty', async () => {
    const wt = tmp();
    seedToken(wt, '');
    const r = await ghTokenPresent.detect({ config: configFor(wt), worktree: wt });
    expect(r.status).toBe('fail');
    expect(r.fixable).toBe(true);
  });

  it('fix() scaffolds the placeholder path + gitignore but the check stays fail (no real token)', async () => {
    const wt = tmp();
    const ctx = { config: configFor(wt), worktree: wt };
    expect(existsSync(tokenPathOf(wt))).toBe(false);

    await ghTokenPresent.fix!(ctx);

    // path/perms/gitignore scaffolded
    const tokenPath = tokenPathOf(wt);
    expect(existsSync(tokenPath)).toBe(true);
    expect(readFileSync(tokenPath, 'utf8')).toBe('');
    expect(statSync(tokenPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(wt, '.gitignore'), 'utf8')).toContain('.claude/secrets/');

    // but the check is still red — fix can't supply a secret
    expect((await ghTokenPresent.detect(ctx)).status).toBe('fail');
  });

  it('detect passes once a real token is pasted after fix()', async () => {
    const wt = tmp();
    const ctx = { config: configFor(wt), worktree: wt };
    await ghTokenPresent.fix!(ctx);
    writeFileSync(tokenPathOf(wt), 'github_pat_REAL\n', 'utf8');
    expect((await ghTokenPresent.detect(ctx)).status).toBe('ok');
  });
});
