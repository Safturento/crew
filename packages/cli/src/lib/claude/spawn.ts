import { execa, type ResultPromise } from 'execa';
import { createWriteStream } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The flag every crew-spawned `claude` must pass. A non-interactive
 * `claude -p` cannot answer a permission prompt, so without this any MCP
 * tool call (e.g. the Figma plugin) the subprocess is asked to make is
 * silently denied. Single source of truth — see CREW-172 for the bug a
 * divergent spawn that omitted it caused.
 */
export const CLAUDE_PERMISSION_FLAG = '--dangerously-skip-permissions';

/**
 * Setting-source flags every crew-spawned `claude` must pass. A headless
 * `claude -p` only loads the `user` + `project` setting sources by default —
 * the `local` source (`<worktree>/.claude/settings.local.json`) is silently
 * skipped. crew injects the `pr_created` PostToolUse hook into exactly that
 * `local` file (`injectStateEventHook`), so without re-opting it in the hook
 * is never registered and a dispatched agent stays `running` after opening a
 * PR. Passing all three sources explicitly restores the hook. See CREW-262.
 */
export const CLAUDE_SETTING_SOURCES_FLAGS = ['--setting-sources', 'user,project,local'] as const;

/**
 * Model every crew-spawned `claude` runs on. Without an explicit `--model`,
 * a headless spawn inherits the user's interactive default (their `/model`
 * selection in user settings) — so switching the interactive session to a
 * pricier tier (e.g. Fable) would silently move every dispatch onto it too.
 * Pinned to Opus so dispatch cost is independent of the interactive choice;
 * override a single run with `CREW_CLAUDE_MODEL`.
 */
export const CLAUDE_DEFAULT_MODEL = 'claude-opus-4-8';

/** `--model` argv pair for a crew claude spawn. Reads the env override at call time. */
export function claudeModelFlags(): string[] {
  return ['--model', process.env.CREW_CLAUDE_MODEL ?? CLAUDE_DEFAULT_MODEL];
}

/**
 * Argv for a fresh (`-p`, no `--resume`) crew claude spawn. Single source of
 * truth shared by `spawnClaudeFresh` and the inline launch in `commands/run.ts`
 * so the permission + setting-sources + model flags can't drift between the two.
 */
export function claudeFreshArgs(prompt: string): string[] {
  return [
    CLAUDE_PERMISSION_FLAG,
    ...CLAUDE_SETTING_SOURCES_FLAGS,
    ...claudeModelFlags(),
    '-p',
    prompt,
  ];
}

/** Argv for a resume (`--resume <id> -p`) crew claude spawn. Sibling of `claudeFreshArgs`. */
export function claudeResumeArgs(sessionId: string, prompt: string): string[] {
  return [
    CLAUDE_PERMISSION_FLAG,
    ...CLAUDE_SETTING_SOURCES_FLAGS,
    ...claudeModelFlags(),
    '--resume',
    sessionId,
    '-p',
    prompt,
  ];
}

/**
 * Build the env for a crew-spawned `claude`: merges `extra` on top of
 * `process.env` and guarantees `~/.local/bin` is on PATH (claude is
 * commonly installed there and a non-interactive shell may not have it).
 *
 * The PATH augmentation is applied last so callers cannot override it.
 */
export function claudeSpawnEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(extra ?? {}),
    // Applied last, from process.env (not the merged value), so a caller
    // cannot override crew's PATH handling — see the JSDoc above.
    PATH: ensureLocalBinOnPath(process.env.PATH),
  };
}

export interface SpawnClaudeResumeOptions {
  sessionId: string;
  prompt: string;
  logFile: string;
  /**
   * Working directory the spawned `claude` runs in. Required because claude
   * derives its project directory (and thus where to look up `--resume`
   * sessions) from cwd — letting it inherit the parent shell's cwd causes
   * "No conversation found" when fix-pr is invoked from outside the worktree.
   */
  cwd: string;
  /**
   * Extra env vars to merge on top of `process.env`. PATH is always
   * augmented with `~/.local/bin` after this merge, so callers cannot
   * override the helper's PATH handling.
   */
  env?: NodeJS.ProcessEnv;
}

/**
 * Spawn `claude --dangerously-skip-permissions --setting-sources
 * user,project,local --model <pinned> --resume <id> -p <prompt>` in the
 * background, piping all stdio to `logFile`. Returns the execa
 * subprocess so the caller can `await` it for completion or wire signal
 * handling (SIGINT) to it.
 */
export function spawnClaudeResume(opts: SpawnClaudeResumeOptions): ResultPromise {
  const sub = execa('claude', claudeResumeArgs(opts.sessionId, opts.prompt), {
    cwd: opts.cwd,
    env: claudeSpawnEnv(opts.env),
  });
  const log = createWriteStream(opts.logFile);
  sub.stdout?.pipe(log);
  sub.stderr?.pipe(log);
  return sub;
}

export interface SpawnClaudeFreshOptions {
  prompt: string;
  logFile: string;
  /** Working directory the spawned claude runs in. */
  cwd: string;
  /** Extra env vars to merge on top of process.env. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Spawn `claude --dangerously-skip-permissions --setting-sources
 * user,project,local --model <pinned> -p <prompt>` (no `--resume`) so claude
 * starts a fresh conversation. Sibling of `spawnClaudeResume`; identical PATH
 * augmentation + env merge.
 */
export function spawnClaudeFresh(opts: SpawnClaudeFreshOptions): ResultPromise {
  const sub = execa('claude', claudeFreshArgs(opts.prompt), {
    cwd: opts.cwd,
    env: claudeSpawnEnv(opts.env),
  });
  const log = createWriteStream(opts.logFile);
  sub.stdout?.pipe(log);
  sub.stderr?.pipe(log);
  return sub;
}

function ensureLocalBinOnPath(currentPath: string | undefined): string {
  const localBin = join(homedir(), '.local', 'bin');
  const segments = (currentPath ?? '').split(':').filter(Boolean);
  if (segments.includes(localBin)) return currentPath ?? '';
  return [localBin, ...segments].join(':');
}
