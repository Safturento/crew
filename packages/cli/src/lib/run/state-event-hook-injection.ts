import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Absolute (via $CLAUDE_PROJECT_DIR) path to the shipped PostToolUse hook. */
const HOOK_PATH = '$CLAUDE_PROJECT_DIR/hooks/state-events/pr-create-postuse.mjs';

interface HookCommand {
  type: 'command';
  command: string;
}
interface HookMatcher {
  matcher: string;
  hooks: HookCommand[];
}
interface SettingsShape {
  hooks?: { PostToolUse?: HookMatcher[]; [k: string]: unknown };
  [k: string]: unknown;
}

export interface StateEventHookInjectionOptions {
  /** The worktree whose `.claude/settings.local.json` to converge. */
  worktree: string;
  /** The dispatched agent key — templated into the hook command. */
  key: string;
  log: (msg: string) => void;
}

/**
 * The hook command for a given key. The key is templated inline as a POSIX
 * `VAR=val` prefix rather than via a per-hook `env` field — an inline prefix is
 * guaranteed to reach the hook process, and the absolute path uses
 * `$CLAUDE_PROJECT_DIR` per the df6a2a3 convention (Claude Code resolves a hook
 * `command` against the shell cwd, not the project root).
 */
function hookCommandFor(key: string): string {
  return `CREW_AGENT_KEY=${key} node "${HOOK_PATH}"`;
}

/**
 * Inject the `pr_created` PostToolUse(Bash) hook into the dispatched session by
 * **array-merging** it into `<worktree>/.claude/settings.local.json`.
 *
 * Targets `settings.local.json` (gitignored by `.claude/*`) rather than the
 * tracked `settings.json`: the key is per-dispatch and must never be committed,
 * and writing the tracked file would leave a dirty diff in the worktree (and be
 * clobbered by the `crew fix-pr` resume rebase). Claude Code merges hooks from
 * `settings.local.json` with those in `settings.json`.
 *
 * Idempotent: a re-dispatch onto the same worktree replaces the existing crew
 * state-event hook (matched by the hook script path) rather than duplicating it,
 * so a changed key is re-templated and stale entries don't accumulate. Every
 * other key (and every non-crew PostToolUse entry) is left untouched.
 *
 * @returns the absolute path written
 */
export function injectStateEventHook(opts: StateEventHookInjectionOptions): string {
  const { worktree, key, log } = opts;
  const dest = join(worktree, '.claude', 'settings.local.json');

  let settings: SettingsShape = {};
  if (existsSync(dest)) {
    settings = JSON.parse(readFileSync(dest, 'utf8')) as SettingsShape;
  }

  const hooks = settings.hooks ?? {};
  // Drop any prior crew state-event hook (identified by the script path) so the
  // merge stays idempotent and a re-dispatched key is re-templated.
  const existing = (hooks.PostToolUse ?? []).filter(
    (entry) => !entry.hooks?.some((h) => h.command?.includes(HOOK_PATH)),
  );

  const entry: HookMatcher = {
    matcher: 'Bash',
    hooks: [{ type: 'command', command: hookCommandFor(key) }],
  };

  settings.hooks = { ...hooks, PostToolUse: [...existing, entry] };

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  log(`state-event-hook: pr_created PostToolUse → ${dest}`);
  return dest;
}
