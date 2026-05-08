import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { PreflightError, type PreflightCheck } from './types.js';

const BRUNO_COMMAND = 'npm run bruno:smoke*';

interface RequiredEntry {
  command: string;
  reason: string;
}

/**
 * Compute the excludedCommands the agent's project needs in its
 * <repo>/.claude/settings.json. Each entry corresponds to a sandbox
 * restriction documented in docs/plans/sandbox-limitations.md.
 *
 * Entries use the verified glob form `command*` (prefix + zero-or-more
 * trailing chars) so that flag/wrapper variants like
 * `npm run test:e2e --workspace=...` and `... 2>&1 | tail -25` still
 * bypass the sandbox. Empirical probe results in
 * docs/superpowers/specs/2026-05-08-agent-shell-e2e-reliability-design.md §3.1.
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

export function verifyExcludedCommandsCheck(): PreflightCheck {
  return {
    name: 'excluded-commands',
    run: async ({ config, worktree }) => {
      const required = requiredEntries(config);
      if (required.length === 0) return;

      const settingsPath = path.join(worktree, '.claude', 'settings.json');

      let raw: string;
      try {
        raw = await readFile(settingsPath, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new PreflightError(
            'excluded-commands',
            '.claude/settings.json missing required excludedCommands',
            'create .claude/settings.json with sandbox.excludedCommands containing the listed entries and commit',
            {
              missing: required.map((r) => `"${r.command}"`).join(', '),
              path: `${settingsPath} (file not found)`,
              hint: "the file is hand-authored today; see docs/followups.md 'Crew owns .claude/settings.json per worktree' for the larger Epic context",
            },
          );
        }
        throw err;
      }

      const parsed = JSON.parse(raw) as {
        sandbox?: { excludedCommands?: string[] };
      };
      const excluded = parsed.sandbox?.excludedCommands ?? [];

      // Exact-string equality on the *committed* entry vs the *required*
      // canonical form. The required form is the verified prefix-glob shape
      // (`command*`); we only certify a settings.json that commits exactly
      // that form, even if a different shape would also bypass the sandbox.
      for (const entry of required) {
        if (!excluded.includes(entry.command)) {
          throw new PreflightError(
            'excluded-commands',
            '.claude/settings.json missing required excludedCommands',
            'add the entry to sandbox.excludedCommands and commit',
            {
              missing: `"${entry.command}"`,
              reason: `required because ${entry.reason}`,
              path: settingsPath,
            },
          );
        }
      }
    },
  };
}
