import { describe, expect, it } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { skillsApplicableTo } from './skill-injection.js';

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

  it('returns visual-fidelity-check when visual_fidelity is configured', () => {
    const config = {
      ...baseConfig,
      visual_fidelity: {
        snapshot_path: '.crew/snap',
        component_dir: 'packages/dashboard/src/components',
      },
    } as ProjectConfig;
    expect(skillsApplicableTo(config)).toEqual(['visual-fidelity-check']);
  });
});
