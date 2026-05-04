import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { PreflightError, type PreflightCheck } from './types.js';

const BRUNO_COMMAND = 'npm run bruno:smoke';

interface RequiredEntry {
  command: string;
  reason: string;
}

function requiredEntries(config: ProjectConfig): RequiredEntry[] {
  const out: RequiredEntry[] = [];

  if (config.bruno_smoke?.enabled) {
    out.push({ command: BRUNO_COMMAND, reason: '[bruno_smoke].enabled = true' });
  }

  if (config.playwright?.authored?.enabled) {
    out.push({
      command: config.playwright.authored.test_command,
      reason: '[playwright].authored.enabled = true',
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

      // Conservative-match: require exact string equality. The Claude Code
      // sandbox may accept prefix-style entries at runtime, but for the *check*
      // we only trust an exact match — looser-than-required prefixes still pass
      // at runtime, we just don't certify them here.
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
