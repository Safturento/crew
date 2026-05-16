import { copySkillIntoWorktree, crewOwnedSkills } from './skill-injection.js';

export type SkillInjectionResult =
  | { kind: 'ok'; skillsInjected: string[] }
  | { kind: 'warning'; reason: string; skillsInjected: string[] };

export interface SkillInjectionOptions {
  worktree: string;
  /** Filesystem path containing crew-owned skill directories. Default: `<repo>/.claude/skills/`. */
  sourceRoot: string;
  /** Filesystem path containing the plugin-sourced `browsing/` skill directory.
   *  When set, `browsing` is injected alongside the crew-owned skills. Omit to
   *  skip it (plugin absent, or project has no [visual_fidelity]). */
  browsingSkillSource?: string;
  log: (msg: string) => void;
  warn: (msg: string) => void;
}

/**
 * Pre-dispatch step that copies each crew-owned skill from sourceRoot into
 * the worktree's `.claude/skills/<name>/`. Per-skill failures are non-fatal —
 * the dispatched agent's discovery still succeeds for any skills that did
 * land, and the missing skill's gate degrades naturally (e.g. visual-fidelity
 * gate reports "skill not loaded" via the PreToolUse hook in B1.3).
 */
export async function runSkillInjection(
  opts: SkillInjectionOptions,
): Promise<SkillInjectionResult> {
  const injected: string[] = [];
  const failures: string[] = [];

  for (const name of crewOwnedSkills()) {
    try {
      const { destDir } = copySkillIntoWorktree(opts.worktree, name, opts.sourceRoot);
      injected.push(name);
      opts.log(`skill-injection: ${name} → ${destDir}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push(`${name}: ${reason}`);
      opts.warn(`skill-injection: failed to inject ${name} — ${reason}`);
    }
  }

  if (opts.browsingSkillSource) {
    try {
      const { destDir } = copySkillIntoWorktree(
        opts.worktree,
        'browsing',
        opts.browsingSkillSource,
      );
      injected.push('browsing');
      opts.log(`skill-injection: browsing → ${destDir}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push(`browsing: ${reason}`);
      opts.warn(`skill-injection: failed to inject browsing — ${reason}`);
    }
  }

  if (failures.length > 0) {
    return { kind: 'warning', reason: failures.join('; '), skillsInjected: injected };
  }
  return { kind: 'ok', skillsInjected: injected };
}
