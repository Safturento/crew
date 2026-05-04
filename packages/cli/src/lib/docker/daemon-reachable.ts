import { execa } from 'execa';

export interface DockerDaemonReachableOptions {
  env: NodeJS.ProcessEnv;
  /** Timeout in ms; defaults to 15000. */
  timeoutMs?: number;
}

/**
 * Quick probe of the docker daemon via `docker info`. Sub-second when the
 * daemon is warm; on WSL2 + Docker Desktop the *first* invocation after a
 * period of inactivity is a cold path — the WSL integration lazily wakes the
 * daemon socket and routinely takes >3s. Default timeout is 15s to cover that
 * cold-start; the warm path stays fast. Used to pre-flight the
 * `dockerUnavailable` signal so the agent's prompt can declare the gap up
 * front rather than the agent discovering it mid-run.
 */
export async function dockerDaemonReachable(opts: DockerDaemonReachableOptions): Promise<boolean> {
  const result = await execa('docker', ['info', '--format', '{{.ServerVersion}}'], {
    env: opts.env,
    reject: false,
    timeout: opts.timeoutMs ?? 15000,
  });
  return result.exitCode === 0;
}
