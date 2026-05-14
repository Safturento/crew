import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
  {
    name: 'browsing',
    applicable: (config) => Boolean(config.visual_fidelity),
  },
];

export function skillsApplicableTo(config: ProjectConfig): string[] {
  return SKILL_APPLICABILITY.filter((entry) => entry.applicable(config)).map((entry) => entry.name);
}

export interface CopySkillResult {
  destDir: string;
}

export function copySkillIntoWorktree(
  worktree: string,
  skillName: string,
  sourceRoot: string,
): CopySkillResult {
  const srcDir = join(sourceRoot, skillName);
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
    throw new Error(`copySkillIntoWorktree: skill directory not found at ${srcDir}`);
  }
  const destDir = join(worktree, '.claude', 'skills', skillName);
  mkdirSync(join(worktree, '.claude', 'skills'), { recursive: true });
  cpSync(srcDir, destDir, { recursive: true });
  return { destDir };
}
