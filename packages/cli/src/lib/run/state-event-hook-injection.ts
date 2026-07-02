import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Basename of the dependency-free hook script shipped in the crew repo root. */
const HOOK_SCRIPT = 'pr-create-postuse.mjs';

/**
 * Absolute (via $CLAUDE_PROJECT_DIR) path to the per-worktree hook copy. Lives
 * under `.claude/crew-hooks/`, alongside the injected `settings.local.json`.
 * Both are untracked (never `git add`ed by dispatch), so they survive the
 * `crew fix-pr` resume rebase; in the crew repo they're also gitignored by
 * `.claude/*`. A non-crew target that doesn't ignore `.claude/` leaves them
 * untracked-but-visible — see the `claude-hooks-untracked-in-non-crew` followup.
 */
const HOOK_PATH = `$CLAUDE_PROJECT_DIR/.claude/crew-hooks/${HOOK_SCRIPT}`;

/**
 * Source of the hook script, resolved relative to this module (never
 * `process.cwd()` — dispatches run with arbitrary cwd). This file sits at
 * `packages/cli/src/lib/run/`, five levels below the repo root where the hook
 * ships (`hooks/state-events/pr-create-postuse.mjs`). The crew CLI runs via tsx
 * against the source tree (no compiled `dist/`), so the source-relative walk is
 * the reliable anchor.
 */
function hookScriptSource(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    '..',
    '..',
    'hooks',
    'state-events',
    HOOK_SCRIPT,
  );
}

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
 * Inject the `pr_created` PostToolUse hook (matching `Bash` and the GitHub MCP
 * PR-create tool) into the dispatched session by **array-merging** it into
 * `<worktree>/.claude/settings.local.json`.
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
  // Drop any prior crew state-event hook (identified by the script basename, so
  // both the current `.claude/crew-hooks/` path and the legacy
  // `hooks/state-events/` path are swept) — keeps the merge idempotent, re-
  // templates a changed key, and stops re-dispatched worktrees accumulating a
  // dead entry pointing at the old, uncopied location.
  const existing = (hooks.PostToolUse ?? []).filter(
    (entry) => !entry.hooks?.some((h) => h.command?.includes(HOOK_SCRIPT)),
  );

  // Fire on a `gh pr create` Bash call OR the GitHub MCP's PR-create tool — the
  // dual-path hook (pr-create-postuse.mjs) recognises both. Claude Code treats a
  // `|`-joined matcher as an alternation of tool names.
  const entry: HookMatcher = {
    matcher: 'Bash|mcp__github__create_pull_request',
    hooks: [{ type: 'command', command: hookCommandFor(key) }],
  };

  settings.hooks = { ...hooks, PostToolUse: [...existing, entry] };

  // Copy the dependency-free hook script into the worktree so it exists even for
  // a non-crew target repo (which has no `hooks/` dir of its own). Overwrite on
  // every dispatch — idempotent, and lets hook fixes propagate to existing
  // worktrees on re-dispatch.
  const hookDest = join(worktree, '.claude', 'crew-hooks', HOOK_SCRIPT);
  mkdirSync(dirname(hookDest), { recursive: true });
  copyFileSync(hookScriptSource(), hookDest);

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  log(`state-event-hook: pr_created PostToolUse → ${dest}`);
  return dest;
}
