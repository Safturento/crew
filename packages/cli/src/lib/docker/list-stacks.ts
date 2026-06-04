import { execa } from 'execa';
import { listRunningProjects, findComposeContainer } from './compose.js';

/** A single row of the `crew docker-list` table. */
export interface DockerStackRow {
  /** compose project name (`com.docker.compose.project` label). */
  project: string;
  /** host port bound to caddy's `80/tcp`, or null if not exposed. */
  http: string | null;
  /** host port bound to caddy's `443/tcp`, or null if not exposed. */
  https: string | null;
  /** host port bound to postgres' `5432/tcp`, or null if not exposed. */
  postgres: string | null;
  /** browser URL when HTTPS is bound, else null. */
  url: string | null;
}

/** Service names to inspect within each compose project. */
export interface StackServiceNames {
  caddy: string;
  postgres: string;
}

/** Injectable docker lookups — defaults shell out via `compose.ts` / execa. */
export interface CollectStacksDeps {
  listProjects: () => Promise<string[]>;
  findContainer: (project: string, service: string) => Promise<string | null>;
  hostPort: (containerId: string, portSpec: string) => Promise<string | null>;
}

/**
 * Resolve the host port bound to a container's `<port>/tcp` spec by parsing
 * `docker port <id> <spec>`. Output looks like `0.0.0.0:8023` or `[::]:8023`;
 * we take the segment after the last colon of the first line. Returns null
 * when the port isn't bound or docker errors.
 */
export async function getHostPort(containerId: string, portSpec: string): Promise<string | null> {
  try {
    const { stdout } = await execa('docker', ['port', containerId, portSpec]);
    const firstLine = stdout.split('\n')[0]?.trim();
    if (!firstLine) return null;
    const port = firstLine.split(':').pop();
    return port ? port : null;
  } catch {
    return null;
  }
}

const defaultDeps: CollectStacksDeps = {
  listProjects: listRunningProjects,
  findContainer: findComposeContainer,
  hostPort: getHostPort,
};

/**
 * Gather one {@link DockerStackRow} per running compose project: the caddy
 * service's HTTP/HTTPS host ports, the postgres service's host port, and the
 * derived browser URL. Rows are sorted lexicographically by project name to
 * mirror the reference `docker-list.sh` (`docker ps … | sort -u`).
 */
export async function collectDockerStacks(
  services: StackServiceNames,
  deps: CollectStacksDeps = defaultDeps,
): Promise<DockerStackRow[]> {
  const projects = [...(await deps.listProjects())].sort();

  const rows: DockerStackRow[] = [];
  for (const project of projects) {
    const caddyId = await deps.findContainer(project, services.caddy);
    const pgId = await deps.findContainer(project, services.postgres);

    const http = caddyId ? await deps.hostPort(caddyId, '80/tcp') : null;
    const https = caddyId ? await deps.hostPort(caddyId, '443/tcp') : null;
    const postgres = pgId ? await deps.hostPort(pgId, '5432/tcp') : null;

    rows.push({ project, http, https, postgres, url: stackUrl(https) });
  }
  return rows;
}

function stackUrl(httpsPort: string | null): string | null {
  if (!httpsPort) return null;
  return httpsPort === '443' ? 'https://localhost' : `https://localhost:${httpsPort}`;
}
