import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { InitAnswers } from './types.js';

const BRUNO_COMMAND = 'npm run bruno:smoke*';
const DOCKER_COMMAND = 'docker compose*';

interface SettingsShape {
  sandbox?: { excludedCommands?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * The sandbox `excludedCommands` a project needs in `.claude/settings.json`,
 * derived from the opted-in features. Mirrors the rules in
 * `lib/health/checks/excluded-commands.ts`'s `requiredEntries` (the verified
 * prefix-glob form `command*` so flag/wrapper variants still bypass the
 * sandbox). That check's `fix()` calls this writer, so this is the single write
 * source and the two intentionally share one command set (CREW-226).
 */
function excludedCommandsFor(answers: InitAnswers): string[] {
  const out: string[] = [];
  if (answers.brunoSmoke) out.push(BRUNO_COMMAND);
  if (answers.playwright?.authored) out.push(`${answers.playwright.authored.testCommand}*`);
  if (answers.docker) out.push(DOCKER_COMMAND);
  return out;
}

/**
 * Seed (or converge) `<worktree>/.claude/settings.json` with the sandbox
 * `excludedCommands` the project's opted-in features require. **Array-merges**
 * into any existing file — required entries are appended only when absent, and
 * every other key (other `sandbox.*` fields, `permissions`, etc.) is left
 * untouched. Never clobbers a hand-authored settings file.
 *
 * @param answers  the wizard answers (feature opt-ins drive the entries)
 * @param worktree the repo root whose `.claude/settings.json` to write
 * @returns the absolute path written
 */
export function writeSettingsJson(answers: InitAnswers, worktree: string): string {
  const dest = join(worktree, '.claude', 'settings.json');

  let settings: SettingsShape = {};
  if (existsSync(dest)) {
    settings = JSON.parse(readFileSync(dest, 'utf8')) as SettingsShape;
  }

  const sandbox = settings.sandbox ?? {};
  const existing = sandbox.excludedCommands ?? [];
  const required = excludedCommandsFor(answers);
  const merged = [...existing];
  for (const cmd of required) {
    if (!merged.includes(cmd)) merged.push(cmd);
  }

  settings.sandbox = { ...sandbox, excludedCommands: merged };

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return dest;
}
