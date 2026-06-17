import type {
  CrewDaemonClient,
  ReportFailedStartInput,
  ReportLaunchingInput,
  RunCommand,
} from '../daemon-client/index.js';
import { PreflightError, renderPreflightError } from '../preflight/index.js';

/**
 * The slice of the daemon client this helper needs. Narrowed to two methods so
 * tests inject a tiny fake rather than a whole client.
 */
export interface TrackedPreflightClient {
  reportLaunching: CrewDaemonClient['reportLaunching'];
  reportFailedStart: CrewDaemonClient['reportFailedStart'];
}

export interface RunTrackedPreflightDeps {
  daemonClient: TrackedPreflightClient;
  key: string;
  projectName: string;
  command: RunCommand;
  worktreePath: string;
  branch: string;
  startedAt: string;
  appUrl?: string | null;
}

/**
 * Register-before-preflight + failed-start capture (CREW-244).
 *
 * Pre-registers the run as `launching` *before* `prepare()` runs the preflight
 * phase, so an init failure leaves a daemon row to convert. If `prepare()`
 * throws a `PreflightError`, records a structured failed-start (the failing
 * check + headline + remediation + the rendered preflight error as `output`)
 * and re-throws so the caller's existing render-and-exit path is unchanged.
 * Non-preflight errors pass straight through untouched.
 *
 * Both daemon calls are best-effort — the client never throws — so a downed
 * daemon degrades to "run not tracked" without breaking `crew run`.
 */
export async function runTrackedPreflight<T>(
  deps: RunTrackedPreflightDeps,
  prepare: () => Promise<T>,
): Promise<T> {
  const launching: ReportLaunchingInput = {
    key: deps.key,
    projectName: deps.projectName,
    command: deps.command,
    worktreePath: deps.worktreePath,
    branch: deps.branch,
    startedAt: deps.startedAt,
    appUrl: deps.appUrl ?? null,
  };
  await deps.daemonClient.reportLaunching(launching);

  try {
    return await prepare();
  } catch (err) {
    if (err instanceof PreflightError) {
      const failedStart: ReportFailedStartInput = {
        key: deps.key,
        projectName: deps.projectName,
        command: deps.command,
        worktreePath: deps.worktreePath,
        branch: deps.branch,
        startedAt: deps.startedAt,
        failure: {
          check: err.checkName,
          headline: err.headline,
          remediation: err.remediation,
          // The rendered error folds in `err.details`, so `output` is the full
          // operator-facing diagnostic.
          output: renderPreflightError(err),
        },
      };
      await deps.daemonClient.reportFailedStart(failedStart);
    }
    throw err;
  }
}
