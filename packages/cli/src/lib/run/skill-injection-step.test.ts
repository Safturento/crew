import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { crewOwnedSkills } from './skill-injection.js';
import { runSkillInjection } from './skill-injection-step.js';

function makeSourceRoot(skillNames: readonly string[]): string {
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

describe('runSkillInjection', () => {
  it('copies every crew-owned skill into the worktree and logs each destination', async () => {
    const sourceRoot = makeSourceRoot(crewOwnedSkills());
    const worktree = makeWorktree();
    const log = vi.fn();
    const warn = vi.fn();

    const result = await runSkillInjection({ worktree, sourceRoot, log, warn });

    expect(result).toEqual({ kind: 'ok', skillsInjected: [...crewOwnedSkills()] });
    for (const name of crewOwnedSkills()) {
      expect(readFileSync(join(worktree, '.claude/skills', name, 'SKILL.md'), 'utf8')).toBe(
        `# ${name}\n`,
      );
    }
    expect(log).toHaveBeenCalledTimes(crewOwnedSkills().length);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns and continues when a skill copy fails', async () => {
    // Source root is missing every crew-owned skill directory.
    const sourceRoot = makeSourceRoot([]);
    const worktree = makeWorktree();
    const log = vi.fn();
    const warn = vi.fn();

    const result = await runSkillInjection({ worktree, sourceRoot, log, warn });

    expect(result.kind).toBe('warning');
    expect(warn).toHaveBeenCalled();
  });

  it('also injects browsing when browsingSkillSource is supplied', async () => {
    const sourceRoot = makeSourceRoot(crewOwnedSkills());
    // A separate root standing in for the plugin cache's `skills/` dir.
    const browsingSkillSource = makeSourceRoot(['browsing']);
    const worktree = makeWorktree();
    const log = vi.fn();
    const warn = vi.fn();

    const result = await runSkillInjection({
      worktree,
      sourceRoot,
      browsingSkillSource,
      log,
      warn,
    });

    expect(result.kind).toBe('ok');
    expect(result.skillsInjected).toContain('browsing');
    expect(readFileSync(join(worktree, '.claude/skills/browsing/SKILL.md'), 'utf8')).toBe(
      '# browsing\n',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not inject browsing when browsingSkillSource is omitted', async () => {
    const sourceRoot = makeSourceRoot(crewOwnedSkills());
    const worktree = makeWorktree();

    const result = await runSkillInjection({
      worktree,
      sourceRoot,
      log: vi.fn(),
      warn: vi.fn(),
    });

    expect(result.skillsInjected).not.toContain('browsing');
    expect(existsSync(join(worktree, '.claude/skills/browsing'))).toBe(false);
  });

  it('warns but does not fail when browsing copy fails', async () => {
    const sourceRoot = makeSourceRoot(crewOwnedSkills());
    // browsingSkillSource points at a dir with no `browsing/` subdir.
    const browsingSkillSource = makeSourceRoot([]);
    const worktree = makeWorktree();
    const log = vi.fn();
    const warn = vi.fn();

    const result = await runSkillInjection({
      worktree,
      sourceRoot,
      browsingSkillSource,
      log,
      warn,
    });

    expect(result.kind).toBe('warning');
    expect(result.skillsInjected).not.toContain('browsing');
    expect(warn).toHaveBeenCalled();
  });
});

describe('runSkillInjection — end-to-end', () => {
  it('produces a worktree containing the injected skill directories on disk', async () => {
    const sourceRoot = makeSourceRoot(crewOwnedSkills());
    const worktree = makeWorktree();

    await runSkillInjection({
      worktree,
      sourceRoot,
      log: () => {},
      warn: () => {},
    });

    for (const name of crewOwnedSkills()) {
      expect(existsSync(join(worktree, '.claude/skills', name, 'SKILL.md'))).toBe(true);
    }
  });
});
