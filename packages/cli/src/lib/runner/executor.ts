import type { ActionRequest, LiveProcess } from 'crew-shared';
import { startupLogFilePath } from '../startup-events/log-file.js';
import type { Registry } from './registry.js';

/** Outcome of shelling an action's verb — the runner reports this to the daemon. */
export type ExecutionResult = { status: 'launched' } | { status: 'failed'; error: string };

/** The spawned process the runner now tracks: pid plus its process-group id. */
export interface LaunchHandle {
  pid: number;
  pgid: number;
}

export interface ExecutorDeps {
  /**
   * Run a short command in `cwd` to completion. Resolves on a clean exit,
   * rejects on failure. Used for `gh pr comment`, which must finish (the
   * comment must land on the PR) before the agent verb launches.
   */
  exec: (file: string, args: string[], opts: { cwd: string }) => Promise<unknown>;
  /**
   * Launch a long-running agent verb (`crew run`/`fix-pr`/`finish`) in `cwd`,
   * detached. Resolves with the spawned `{ pid, pgid }` once the process has
   * started — "launched" means it spawned, not that the (minutes-long) agent
   * run finished. Detached spawns get their own process group, so `pgid === pid`
   * and signalling `-pgid` reaches the whole tree. Rejects on spawn failure
   * (e.g. `crew` not on PATH).
   *
   * `logFile` (when set) is the per-key startup log the launcher opens
   * append-mode and wires to the child's stdout+stderr, so the whole `crew run`
   * lifetime — including a silent pre-registration death — is captured to disk.
   */
  launch: (
    file: string,
    args: string[],
    opts: { cwd: string; logFile?: string },
  ) => Promise<LaunchHandle>;
  /**
   * Resolve a project slug to its on-disk repo path. Throws when the project
   * has no registered config — the runner reports that as a `failed` launch
   * rather than blindly shelling in the wrong directory.
   */
  resolveRepoDir: (project: string) => string;
  /** Live-process registry — the spawned process is recorded here on launch. */
  registry: Registry;
  /** Clock for the `spawnedAt` stamp; injectable for deterministic tests. */
  now?: () => Date;
}

/** Map an `ActionKind` (`fix_pr`) to the `LiveProcess` command label (`fix-pr`). */
function toCommand(kind: ActionRequest['kind']): LiveProcess['command'] {
  return kind === 'fix_pr' ? 'fix-pr' : kind;
}

/**
 * Pure mapping from a claimed {@link ActionRequest} to its host-side execution.
 * Each kind shells the matching CLI verb in the target project's repo:
 *
 * - `run`    → `crew run <key>`
 * - `fix_pr` → `gh pr comment <key> --body <comment>` **then** `crew fix-pr <key> --from-pr`
 * - `finish` → `crew finish <key>`
 * - `resume` → `crew resume <key>` (continues an interrupted run on its worktree)
 *
 * The PR comment is posted before `fix-pr` so the resumed agent picks it up
 * from the PR thread (crew's fix-pr feedback channel). Any throw — an
 * unresolvable repo, a failed `gh` comment, a spawn error — short-circuits to
 * `failed` carrying the message; a clean run returns `launched`.
 */
export async function executeAction(
  action: ActionRequest,
  deps: ExecutorDeps,
): Promise<ExecutionResult> {
  let cwd: string;
  try {
    cwd = deps.resolveRepoDir(action.project);
  } catch (err) {
    return { status: 'failed', error: (err as Error).message };
  }

  // Capture every verb's whole-lifetime console output to the per-key startup
  // log, so a death before daemon registration still leaves a non-empty log.
  const logFile = startupLogFilePath(action.ticketKey);

  let handle: LaunchHandle;
  try {
    switch (action.kind) {
      case 'run':
        handle = await deps.launch('crew', ['run', action.ticketKey], { cwd, logFile });
        break;
      case 'fix_pr': {
        const comment = action.payload.kind === 'fix_pr' ? action.payload.comment : '';
        await deps.exec('gh', ['pr', 'comment', action.ticketKey, '--body', comment], { cwd });
        handle = await deps.launch('crew', ['fix-pr', action.ticketKey, '--from-pr'], {
          cwd,
          logFile,
        });
        break;
      }
      case 'finish':
        handle = await deps.launch('crew', ['finish', action.ticketKey], { cwd, logFile });
        break;
      case 'resume':
        handle = await deps.launch('crew', ['resume', action.ticketKey], { cwd, logFile });
        break;
      default:
        return {
          status: 'failed',
          error: `unknown action kind: ${(action as ActionRequest).kind}`,
        };
    }
  } catch (err) {
    return { status: 'failed', error: (err as Error).message };
  }

  // Track the spawned process so the heartbeat snapshot reflects it and the
  // operator can signal it through the reverse-command queue.
  deps.registry.add({
    agentKey: action.ticketKey,
    command: toCommand(action.kind),
    pid: handle.pid,
    pgid: handle.pgid,
    actionRequestId: action.id,
    spawnedAt: (deps.now?.() ?? new Date()).toISOString(),
    state: 'running',
    project: action.project,
  });

  return { status: 'launched' };
}
