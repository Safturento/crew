import { dockerDaemonReachable } from '../../docker/daemon-reachable.js';
import { fail, ok, type HealthCheck } from '../types.js';

export interface DockerSocketDeps {
  /** Probe whether the docker daemon is reachable. Defaults to `docker info`. */
  reachable?: (env: NodeJS.ProcessEnv) => Promise<boolean>;
}

/**
 * Machine check: the docker daemon socket is reachable. Reuses the dispatch-time
 * `dockerDaemonReachable` probe (`docker info`). No `fix()` — crew can't start
 * the Docker daemon on the user's behalf; the remediation tells them to.
 *
 * Factory-with-default-deps so the host probe is injectable in unit tests; the
 * registry imports the default `dockerSocket` instance.
 */
export function createDockerSocketCheck(deps: DockerSocketDeps = {}): HealthCheck {
  const reachable = deps.reachable ?? ((env) => dockerDaemonReachable({ env }));
  return {
    name: 'docker-socket',
    scope: 'machine',
    detect: async () => {
      if (await reachable(process.env)) {
        return ok('docker daemon is reachable');
      }
      return fail('docker daemon is not reachable', {
        remediation: 'start Docker (e.g. open Docker Desktop, or `sudo systemctl start docker`)',
        details: { probe: 'docker info' },
      });
    },
  };
}

export const dockerSocket = createDockerSocketCheck();
