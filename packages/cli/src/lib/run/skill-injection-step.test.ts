import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { discoverSkills } from '../prompts/skills.js';
import { runSkillInjection } from './skill-injection-step.js';

function makeSourceRoot(skillNames: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'crew-skill-source-'));
  for (const name of skillNames) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, 'SKILL.md'), `# ${name}\n`);
  }
  return root;
}

function makeWorktree(): string {
  const wt = mkdtempSync(join(tmpdir(), 'crew-skill-wt-'));
  mkdirSync(wt, { recursive: true });
  return wt;
}

const baseConfig: ProjectConfig = {
  name: 'crew',
  repo_path: '/tmp/repo',
  default_branch: 'main',
  github: { repo: 'foo/bar' },
  jira: { site: 'https://x.atlassian.net', project_key: 'CREW' },
} as ProjectConfig;

describe('runSkillInjection', () => {
  it('returns "skipped" when no skills are applicable', async () => {
    const sourceRoot = makeSourceRoot(['visual-fidelity-check']);
    const worktree = makeWorktree();
    const log = vi.fn();
    const warn = vi.fn();
    const result = await runSkillInjection({
      worktree,
      config: baseConfig,
      sourceRoot,
      log,
      warn,
    });
    expect(result).toEqual({ kind: 'skipped' });
    expect(log).not.toHaveBeenCalled();
  });

  it('copies the applicable skills into the worktree and logs the destinations', async () => {
    const sourceRoot = makeSourceRoot(['visual-fidelity-check', 'browsing']);
    const worktree = makeWorktree();
    const log = vi.fn();
    const warn = vi.fn();
    const config = {
      ...baseConfig,
      visual_fidelity: {
        snapshot_path: '.crew/snap',
        component_dir: 'packages/dashboard/src/components',
      },
    } as ProjectConfig;

    const result = await runSkillInjection({ worktree, config, sourceRoot, log, warn });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.skillsInjected.sort()).toEqual(['browsing', 'visual-fidelity-check']);
    }
    expect(
      readFileSync(join(worktree, '.claude/skills/visual-fidelity-check/SKILL.md'), 'utf8'),
    ).toBe('# visual-fidelity-check\n');
    expect(
      readFileSync(join(worktree, '.claude/skills/browsing/SKILL.md'), 'utf8'),
    ).toBe('# browsing\n');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('visual-fidelity-check'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('browsing'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns and continues when a skill copy fails', async () => {
    const sourceRoot = makeSourceRoot([]);
    const worktree = makeWorktree();
    const log = vi.fn();
    const warn = vi.fn();
    const config = {
      ...baseConfig,
      visual_fidelity: {
        snapshot_path: '.crew/snap',
        component_dir: 'packages/dashboard/src/components',
      },
    } as ProjectConfig;

    const result = await runSkillInjection({ worktree, config, sourceRoot, log, warn });
    expect(result.kind).toBe('warning');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('visual-fidelity-check'));
  });
});

describe('runSkillInjection — end-to-end discovery', () => {
  it('produces a worktree whose project-level skill discovery finds the injected skill', async () => {
    const sourceRoot = makeSourceRoot([]);
    mkdirSync(join(sourceRoot, 'visual-fidelity-check'), { recursive: true });
    writeFileSync(
      join(sourceRoot, 'visual-fidelity-check', 'SKILL.md'),
      '---\nname: visual-fidelity-check\ndescription: real-looking description\n---\n# body\n',
    );

    const worktree = makeWorktree();
    const config = {
      ...baseConfig,
      visual_fidelity: {
        snapshot_path: '.crew/snap',
        component_dir: 'packages/dashboard/src/components',
      },
    } as ProjectConfig;

    await runSkillInjection({
      worktree,
      config,
      sourceRoot,
      log: () => {},
      warn: () => {},
    });

    const skills = discoverSkills({ repoPath: worktree, home: '/nonexistent' });
    expect(skills).toContainEqual(
      expect.objectContaining({ name: 'visual-fidelity-check', source: 'project' }),
    );
  });
});
