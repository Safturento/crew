import { execa } from 'execa';

export interface DockerDaemonReachableOptions {
  env: NodeJS.ProcessEnv;
  /** Timeout in ms; defaults to 3000. */
  timeoutMs?: number;
}

/**
 * Quick probe of the docker daemon via `docker info`. Fast (~100ms when
 * healthy, ~1s when the socket is dead). Used to pre-flight the
 * `dockerUnavailable` signal so the agent's prompt can declare the gap up
 * front rather than the agent discovering it mid-run.
 */
export async function dockerDaemonReachable(opts: DockerDaemonReachableOptions): Promise<boolean> {
  const result = await execa('docker', ['info', '--format', '{{.ServerVersion}}'], {
    env: opts.env,
    reject: false,
    timeout: opts.timeoutMs ?? 3000,
  });
  return result.exitCode === 0;
}
