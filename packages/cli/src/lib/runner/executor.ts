import type { ActionRequest } from 'crew-shared';

/** Outcome of shelling an action's verb — the runner reports this to the daemon. */
export type ExecutionResult = { status: 'launched' } | { status: 'failed'; error: string };

export interface ExecutorDeps {
  /**
   * Spawn a command in `cwd`. Resolves on a clean spawn+exit, rejects on
   * failure — injected so tests can drive the verb mapping without a shell.
   * In production this is an `execa` wrapper.
   */
  exec: (file: string, args: string[], opts: { cwd: string }) => Promise<unknown>;
  /**
   * Resolve a project slug to its on-disk repo path. Throws when the project
   * has no registered config — the runner reports that as a `failed` launch
   * rather than blindly shelling in the wrong directory.
   */
  resolveRepoDir: (project: string) => string;
}

/**
 * Pure mapping from a claimed {@link ActionRequest} to its host-side execution.
 * Each kind shells the matching CLI verb in the target project's repo:
 *
 * - `run`    → `crew run <key>`
 * - `fix_pr` → `gh pr comment <key> --body <comment>` **then** `crew fix-pr <key> --from-pr`
 * - `finish` → `crew finish <key>`
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

  try {
    switch (action.kind) {
      case 'run':
        await deps.exec('crew', ['run', action.ticketKey], { cwd });
        break;
      case 'fix_pr': {
        const comment = action.payload.kind === 'fix_pr' ? action.payload.comment : '';
        await deps.exec('gh', ['pr', 'comment', action.ticketKey, '--body', comment], { cwd });
        await deps.exec('crew', ['fix-pr', action.ticketKey, '--from-pr'], { cwd });
        break;
      }
      case 'finish':
        await deps.exec('crew', ['finish', action.ticketKey], { cwd });
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

  return { status: 'launched' };
}
