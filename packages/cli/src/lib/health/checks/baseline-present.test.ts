import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { baselinePresent } from './baseline-present.js';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'crew-baseline-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function configFor(worktree: string): ProjectConfig {
  return {
    name: 'x',
    repo_path: worktree,
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: 'u/r' },
  } as unknown as ProjectConfig;
}

function withBaseline(wt: string): void {
  writeFileSync(join(wt, 'AGENTS.md'), '# AGENTS\n');
  mkdirSync(join(wt, '.agents'), { recursive: true });
}

describe('baseline-present', () => {
  it('is a project-scoped warn-level check with no fix', () => {
    expect(baselinePresent.scope).toBe('project');
    expect(baselinePresent.fix).toBeUndefined();
  });

  it('ok when both AGENTS.md and .agents/ exist', async () => {
    const wt = tmp();
    withBaseline(wt);
    const r = await baselinePresent.detect({ config: configFor(wt), worktree: wt });
    expect(r.status).toBe('ok');
  });

  it('warns (never fails) when AGENTS.md is missing', async () => {
    const wt = tmp();
    mkdirSync(join(wt, '.agents'), { recursive: true });
    const r = await baselinePresent.detect({ config: configFor(wt), worktree: wt });
    expect(r.status).toBe('warn');
    expect(r.fixable).toBeUndefined();
    expect(r.remediation).toContain('establishing-a-new-project');
  });

  it('warns (never fails) when .agents/ is missing', async () => {
    const wt = tmp();
    writeFileSync(join(wt, 'AGENTS.md'), '# AGENTS\n');
    const r = await baselinePresent.detect({ config: configFor(wt), worktree: wt });
    expect(r.status).toBe('warn');
  });

  it('warns when both are missing', async () => {
    const wt = tmp();
    const r = await baselinePresent.detect({ config: configFor(wt), worktree: wt });
    expect(r.status).toBe('warn');
  });
});
