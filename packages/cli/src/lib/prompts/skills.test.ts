import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverSkills, renderDiscoveredSkillsBlock } from './skills.js';

let homeFixture: string;
let repoFixture: string;
let emptyFixture: string;
let tmpRoot: string;

function writeSkill(root: string, dir: string, body: string): void {
  const skillDir = join(root, '.claude', 'skills', dir);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), body);
}

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'crew-skills-test-'));
  homeFixture = join(tmpRoot, 'home');
  repoFixture = join(tmpRoot, 'repo');
  emptyFixture = join(tmpRoot, 'empty');
  mkdirSync(homeFixture);
  mkdirSync(repoFixture);
  mkdirSync(emptyFixture);

  writeSkill(
    homeFixture,
    'alpha-skill',
    `---\nname: alpha-skill\ndescription: Use when alpha-skill scenarios apply.\n---\n\n# Alpha Skill\n\nBody text here is irrelevant to discovery.\n`,
  );
  writeSkill(
    homeFixture,
    'beta-skill',
    `---\nname: beta-skill\ndescription: Use when beta-skill scenarios apply.\n---\n\n# Beta Skill\n`,
  );
  writeSkill(
    homeFixture,
    'no-description',
    `---\nname: no-description\n---\n\n# No Description\n\nFrontmatter is missing the \`description\` field — discoverSkills must skip this entry.\n`,
  );
  writeSkill(
    homeFixture,
    'malformed',
    `---\nname: malformed\ndescription: "unterminated string\n---\n\n# Malformed\n`,
  );
  // Empty skill dir — exists but contains no SKILL.md.
  mkdirSync(join(homeFixture, '.claude', 'skills', 'empty-dir'), { recursive: true });

  writeSkill(
    repoFixture,
    'project-skill',
    `---\nname: project-skill\ndescription: Use when project-skill scenarios apply.\n---\n\n# Project Skill\n`,
  );
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('discoverSkills', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns [] when neither home nor repoPath has .claude/skills/', () => {
    const result = discoverSkills({ home: emptyFixture, repoPath: emptyFixture });
    expect(result).toEqual([]);
  });

  it('discovers user-level skills from <home>/.claude/skills/*/SKILL.md', () => {
    const result = discoverSkills({ home: homeFixture, repoPath: emptyFixture });
    const userNames = result.filter((s) => s.source === 'user').map((s) => s.name);
    expect(userNames).toContain('alpha-skill');
    expect(userNames).toContain('beta-skill');
  });

  it('discovers project-level skills from <repoPath>/.claude/skills/*/SKILL.md', () => {
    const result = discoverSkills({ home: emptyFixture, repoPath: repoFixture });
    const projectNames = result.filter((s) => s.source === 'project').map((s) => s.name);
    expect(projectNames).toEqual(['project-skill']);
  });

  it('combines both sources when both exist, alphabetized within source, user before project', () => {
    const result = discoverSkills({ home: homeFixture, repoPath: repoFixture });
    const valid = result.filter((s) =>
      ['alpha-skill', 'beta-skill', 'project-skill'].includes(s.name),
    );
    expect(valid).toEqual([
      { name: 'alpha-skill', description: 'Use when alpha-skill scenarios apply.', source: 'user' },
      { name: 'beta-skill', description: 'Use when beta-skill scenarios apply.', source: 'user' },
      {
        name: 'project-skill',
        description: 'Use when project-skill scenarios apply.',
        source: 'project',
      },
    ]);
  });

  it('skips skill directories that lack a SKILL.md', () => {
    const result = discoverSkills({ home: homeFixture, repoPath: emptyFixture });
    expect(result.find((s) => s.name === 'empty-dir')).toBeUndefined();
  });

  it('skips frontmatter without a description field and warns', () => {
    const result = discoverSkills({ home: homeFixture, repoPath: emptyFixture });
    expect(result.find((s) => s.name === 'no-description')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no-description'));
  });

  it('skips SKILL.md files with unparseable frontmatter and warns', () => {
    const result = discoverSkills({ home: homeFixture, repoPath: emptyFixture });
    expect(result.find((s) => s.name === 'malformed')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('malformed'));
  });
});

describe('renderDiscoveredSkillsBlock', () => {
  it('returns empty string for empty input', () => {
    expect(renderDiscoveredSkillsBlock([])).toBe('');
  });

  it('renders only the user paragraph when only user skills are present', () => {
    const result = renderDiscoveredSkillsBlock([
      { name: 'alpha', description: 'Use when alpha.', source: 'user' },
      { name: 'beta', description: 'Use when beta.', source: 'user' },
    ]);

    expect(result).toContain('user-level skills');
    expect(result).not.toContain('project-level skills');
    expect(result).toContain('- **`alpha`** — Use when alpha.');
    expect(result).toContain('- **`beta`** — Use when beta.');
  });

  it('renders only the project paragraph when only project skills are present', () => {
    const result = renderDiscoveredSkillsBlock([
      { name: 'gamma', description: 'Use when gamma.', source: 'project' },
    ]);

    expect(result).not.toContain('user-level skills');
    expect(result).toContain('project-level skills');
    expect(result).toContain('- **`gamma`** — Use when gamma.');
  });

  it('renders both paragraphs in user-then-project order', () => {
    const result = renderDiscoveredSkillsBlock([
      { name: 'alpha', description: 'Use when alpha.', source: 'user' },
      { name: 'gamma', description: 'Use when gamma.', source: 'project' },
    ]);

    const userIdx = result.indexOf('user-level skills');
    const projectIdx = result.indexOf('project-level skills');
    expect(userIdx).toBeGreaterThan(-1);
    expect(projectIdx).toBeGreaterThan(userIdx);
  });

  it('alphabetizes bullets within each source', () => {
    const result = renderDiscoveredSkillsBlock([
      { name: 'beta', description: 'Use when beta.', source: 'user' },
      { name: 'alpha', description: 'Use when alpha.', source: 'user' },
      { name: 'delta', description: 'Use when delta.', source: 'project' },
      { name: 'charlie', description: 'Use when charlie.', source: 'project' },
    ]);

    expect(result.indexOf('alpha')).toBeLessThan(result.indexOf('beta'));
    expect(result.indexOf('charlie')).toBeLessThan(result.indexOf('delta'));
  });

  it('starts with a blank-line separator so it concatenates cleanly under the curated block', () => {
    const result = renderDiscoveredSkillsBlock([
      { name: 'alpha', description: 'Use when alpha.', source: 'user' },
    ]);
    expect(result.startsWith('\n')).toBe(true);
  });
});
