import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Skills crew owns and injects into every dispatched worktree. Source of
 * truth: <crew-repo>/.claude/skills/<name>/. Each skill self-gates via its
 * own description, so injecting a non-applicable one is harmless. */
const CREW_OWNED_SKILLS = [
  'agents-doc-parity-check',
  'bruno-collection-maintenance',
  'visual-fidelity-check',
] as const;

export function crewOwnedSkills(): readonly string[] {
  return CREW_OWNED_SKILLS;
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
