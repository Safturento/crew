import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { copySkillIntoWorktree, skillsApplicableTo } from './skill-injection.js';

const baseConfig: ProjectConfig = {
  name: 'crew',
  repo_path: '/tmp/repo',
  default_branch: 'main',
  github: { repo: 'foo/bar' },
  jira: { site: 'https://x.atlassian.net', project_key: 'CREW' },
} as ProjectConfig;

describe('skillsApplicableTo', () => {
  it('returns no skills when no per-skill config is set', () => {
    expect(skillsApplicableTo(baseConfig)).toEqual([]);
  });

  it('returns visual-fidelity-check and browsing when visual_fidelity is configured', () => {
    const config = {
      ...baseConfig,
      visual_fidelity: {
        snapshot_path: '.crew/snap',
        component_dir: 'packages/dashboard/src/components',
      },
    } as ProjectConfig;
    expect(skillsApplicableTo(config).sort()).toEqual(['browsing', 'visual-fidelity-check']);
  });
});

describe('copySkillIntoWorktree', () => {
  it('copies SKILL.md, workflow.md, and examples/ into <worktree>/.claude/skills/<name>/', () => {
    const root = mkdtempSync(join(tmpdir(), 'crew-skill-inject-'));
    const worktree = join(root, 'worktree');
    const sourceRoot = join(root, 'src-skills');

    mkdirSync(join(sourceRoot, 'visual-fidelity-check', 'examples'), { recursive: true });
    writeFileSync(join(sourceRoot, 'visual-fidelity-check', 'SKILL.md'), '# skill\n');
    writeFileSync(join(sourceRoot, 'visual-fidelity-check', 'workflow.md'), '# workflow\n');
    writeFileSync(join(sourceRoot, 'visual-fidelity-check', 'examples', 'good.md'), '# good\n');

    mkdirSync(worktree, { recursive: true });

    const result = copySkillIntoWorktree(worktree, 'visual-fidelity-check', sourceRoot);

    expect(result.destDir).toBe(join(worktree, '.claude', 'skills', 'visual-fidelity-check'));
    expect(readFileSync(join(result.destDir, 'SKILL.md'), 'utf8')).toBe('# skill\n');
    expect(readFileSync(join(result.destDir, 'workflow.md'), 'utf8')).toBe('# workflow\n');
    expect(readFileSync(join(result.destDir, 'examples', 'good.md'), 'utf8')).toBe('# good\n');
  });

  it('throws when the source skill directory does not exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'crew-skill-inject-missing-'));
    mkdirSync(join(root, 'worktree'), { recursive: true });
    expect(() =>
      copySkillIntoWorktree(join(root, 'worktree'), 'nope', join(root, 'src-skills')),
    ).toThrow(/skill directory not found/i);
  });
});
