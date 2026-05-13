import type { ProjectConfig } from 'crew-shared';

/**
 * Skills the dispatcher injects into the worktree's `.claude/skills/` based
 * on per-project config. Adding a new dispatcher-managed skill: add its name
 * here, paired with the config field that gates it.
 */
const SKILL_APPLICABILITY: ReadonlyArray<{
  name: string;
  applicable: (config: ProjectConfig) => boolean;
}> = [
  {
    name: 'visual-fidelity-check',
    applicable: (config) => Boolean(config.visual_fidelity),
  },
];

export function skillsApplicableTo(config: ProjectConfig): string[] {
  return SKILL_APPLICABILITY.filter((entry) => entry.applicable(config)).map((entry) => entry.name);
}
