import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { writeSettingsJson, type InitAnswers } from '../../init/index.js';
import { fail, ok, type HealthCheck } from '../types.js';

const BRUNO_COMMAND = 'npm run bruno:smoke*';

interface RequiredEntry {
  command: string;
  reason: string;
}

/**
 * The `excludedCommands` a project needs in its `<repo>/.claude/settings.json`,
 * each corresponding to a sandbox restriction documented in `.agents/security.md`.
 *
 * Entries use the verified glob form `command*` (prefix + zero-or-more trailing
 * chars) so that flag/wrapper variants like `npm run test:e2e --workspace=...`
 * and `... 2>&1 | tail -25` still bypass the sandbox. Empirical probe results in
 * docs/superpowers/specs/2026-05-08-agent-shell-e2e-reliability-design.md §3.1.
 *
 * Mirrors `lib/init/write-settings-json.ts`'s `excludedCommandsFor` (the write
 * side); kept here with `reason`s because the diagnosis needs them for the
 * remediation detail. The two are intentionally the single command set.
 */
function requiredEntries(config: ProjectConfig): RequiredEntry[] {
  const out: RequiredEntry[] = [];

  if (config.bruno_smoke?.enabled) {
    out.push({ command: BRUNO_COMMAND, reason: '[bruno_smoke].enabled = true' });
  }

  if (config.playwright?.authored?.enabled) {
    out.push({
      command: `${config.playwright.authored.test_command}*`,
      reason: '[playwright].authored.enabled = true',
    });
  }

  if (config.docker) {
    out.push({
      command: 'docker compose*',
      reason: '[docker] block present (agent does Step 0.5 bringup)',
    });
  }

  return out;
}

/** Map a loaded config onto the `InitAnswers` fields `writeSettingsJson` reads. */
function answersFor(config: ProjectConfig): InitAnswers {
  return {
    name: config.name,
    repoPath: config.repo_path,
    jira: { projectKey: config.jira.project_key, site: config.jira.site },
    github: { repo: config.github.repo },
    docker: config.docker ? { canonicalWorktree: config.docker.canonical_worktree } : undefined,
    brunoSmoke: config.bruno_smoke?.enabled
      ? { baseUrl: config.bruno_smoke.base_url, collectionDir: config.bruno_smoke.collection_dir }
      : undefined,
    playwright: config.playwright?.authored?.enabled
      ? {
          authored: {
            testsDir: config.playwright.authored.tests_dir,
            testCommand: config.playwright.authored.test_command,
          },
        }
      : undefined,
  };
}

/**
 * Verify `<worktree>/.claude/settings.json` commits every sandbox
 * `excludedCommand` the project's opted-in features require — the dispatch-gate
 * check the agent likely cannot author for itself.
 *
 * Absorbs the former `lib/preflight/verify-excluded-commands.ts`. `detect()`
 * diffs required vs committed (exact-string on the verified `command*` form);
 * `fix()` array-merges the missing entries via the `lib/init` scaffolder (the
 * single write source) and never clobbers a hand-authored file.
 */
export const excludedCommands: HealthCheck = {
  name: 'excluded-commands',
  scope: 'project',
  detect: async ({ config, worktree }) => {
    const required = requiredEntries(config);
    if (required.length === 0) return ok('no sandbox-excluded commands required');

    const settingsPath = path.join(worktree, '.claude', 'settings.json');

    let raw: string;
    try {
      raw = await readFile(settingsPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return fail('.claude/settings.json missing required excludedCommands', {
          remediation:
            'create .claude/settings.json with sandbox.excludedCommands containing the listed entries (crew doctor --fix, or crew init)',
          fixable: true,
          details: {
            missing: required.map((r) => `"${r.command}"`).join(', '),
            path: `${settingsPath} (file not found)`,
          },
        });
      }
      throw err;
    }

    const parsed = JSON.parse(raw) as { sandbox?: { excludedCommands?: string[] } };
    const excluded = parsed.sandbox?.excludedCommands ?? [];

    // Exact-string equality on the *committed* entry vs the *required* canonical
    // form. The required form is the verified prefix-glob shape (`command*`); we
    // only certify a settings.json that commits exactly that form, even if a
    // different shape would also bypass the sandbox.
    for (const entry of required) {
      if (!excluded.includes(entry.command)) {
        return fail('.claude/settings.json missing required excludedCommands', {
          remediation:
            'add the entry to sandbox.excludedCommands (crew doctor --fix, or crew init)',
          fixable: true,
          details: {
            missing: `"${entry.command}"`,
            reason: `required because ${entry.reason}`,
            path: settingsPath,
          },
        });
      }
    }

    return ok('.claude/settings.json has all required excludedCommands');
  },
  fix: async ({ config, worktree }) => {
    writeSettingsJson(answersFor(config), worktree);
  },
};
