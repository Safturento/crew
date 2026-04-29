import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';

export interface DiscoveredSkill {
  name: string;
  description: string;
  source: 'user' | 'project';
}

export interface DiscoverSkillsOptions {
  repoPath: string;
  home?: string;
}

export function discoverSkills(opts: DiscoverSkillsOptions): DiscoveredSkill[] {
  const home = opts.home ?? homedir();
  const userSkills = readSkillsFromRoot(join(home, '.claude', 'skills'), 'user');
  const projectSkills = readSkillsFromRoot(join(opts.repoPath, '.claude', 'skills'), 'project');
  return [...sortByName(userSkills), ...sortByName(projectSkills)];
}

function readSkillsFromRoot(root: string, source: 'user' | 'project'): DiscoveredSkill[] {
  if (!existsSync(root)) return [];

  const entries: DiscoveredSkill[] = [];
  for (const dir of readdirSync(root)) {
    const skillDir = join(root, dir);
    if (!statSync(skillDir).isDirectory()) continue;

    const skillFile = join(skillDir, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    let frontmatter: Record<string, unknown>;
    try {
      const raw = readFileSync(skillFile, 'utf8');
      frontmatter = matter(raw).data;
    } catch (err) {
      console.warn(
        `crew: skipping skill at ${skillFile} — could not parse frontmatter (${(err as Error).message})`,
      );
      continue;
    }

    const description = frontmatter.description;
    if (typeof description !== 'string' || description.trim() === '') {
      console.warn(`crew: skipping skill at ${skillFile} — frontmatter has no description`);
      continue;
    }

    const name =
      typeof frontmatter.name === 'string' && frontmatter.name.trim() !== ''
        ? frontmatter.name
        : dir;

    entries.push({ name, description, source });
  }

  return entries;
}

function sortByName(skills: DiscoveredSkill[]): DiscoveredSkill[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name));
}

export function renderDiscoveredSkillsBlock(skills: DiscoveredSkill[]): string {
  if (skills.length === 0) return '';

  const userSkills = sortByName(skills.filter((s) => s.source === 'user'));
  const projectSkills = sortByName(skills.filter((s) => s.source === 'project'));

  const paragraphs: string[] = [];
  if (userSkills.length > 0) {
    paragraphs.push(renderParagraph('user-level', userSkills));
  }
  if (projectSkills.length > 0) {
    paragraphs.push(renderParagraph('project-level', projectSkills));
  }

  if (paragraphs.length === 0) return '';
  return `\n\n${paragraphs.join('\n\n')}`;
}

function renderParagraph(label: 'user-level' | 'project-level', skills: DiscoveredSkill[]): string {
  const lead = `The following ${label} skills are equally required when their description matches what you're about to do — invoke them via the \`Skill\` tool the same way:`;
  const bullets = skills.map((s) => `- **\`${s.name}\`** — ${s.description}`).join('\n');
  return `${lead}\n\n${bullets}`;
}
