import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHostPort, collectDockerStacks, type CollectStacksDeps } from './list-stacks.js';
import { execa } from 'execa';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const mockedExeca = vi.mocked(execa);

describe('getHostPort', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
  });

  it('returns the host port from `docker port` output', async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: '0.0.0.0:8023\n' } as never);
    expect(await getHostPort('abc123', '80/tcp')).toBe('8023');
    expect(mockedExeca).toHaveBeenCalledWith('docker', ['port', 'abc123', '80/tcp']);
  });

  it('takes the port after the last colon (ipv6 form)', async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: '[::]:15423\n' } as never);
    expect(await getHostPort('abc123', '5432/tcp')).toBe('15423');
  });

  it('uses the first line when docker prints multiple bindings', async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: '0.0.0.0:8421\n[::]:8421\n' } as never);
    expect(await getHostPort('abc123', '443/tcp')).toBe('8421');
  });

  it('returns null when the port is not bound (empty output)', async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never);
    expect(await getHostPort('abc123', '443/tcp')).toBeNull();
  });

  it('returns null when docker errors', async () => {
    mockedExeca.mockRejectedValueOnce(new Error('No such container'));
    expect(await getHostPort('abc123', '443/tcp')).toBeNull();
  });
});

describe('collectDockerStacks', () => {
  /** Build injectable deps from fixture maps. */
  function makeDeps(
    projects: string[],
    containers: Record<string, Record<string, string | null>>,
    ports: Record<string, Record<string, string | null>>,
  ): CollectStacksDeps {
    return {
      listProjects: async () => projects,
      findContainer: async (project, service) => containers[project]?.[service] ?? null,
      hostPort: async (containerId, portSpec) => ports[containerId]?.[portSpec] ?? null,
    };
  }

  it('returns an empty array when no stacks are running', async () => {
    const rows = await collectDockerStacks(
      { caddy: 'caddy', postgres: 'postgres' },
      makeDeps([], {}, {}),
    );
    expect(rows).toEqual([]);
  });

  it('builds a full row with http, https, postgres and a port-suffixed url', async () => {
    const rows = await collectDockerStacks(
      { caddy: 'caddy', postgres: 'postgres' },
      makeDeps(
        ['recipes-app-kan-23'],
        { 'recipes-app-kan-23': { caddy: 'caddy23', postgres: 'pg23' } },
        {
          caddy23: { '80/tcp': '8023', '443/tcp': '8423' },
          pg23: { '5432/tcp': '15423' },
        },
      ),
    );
    expect(rows).toEqual([
      {
        project: 'recipes-app-kan-23',
        http: '8023',
        https: '8423',
        postgres: '15423',
        url: 'https://localhost:8423',
      },
    ]);
  });

  it('omits the port suffix when https is bound to 443', async () => {
    const rows = await collectDockerStacks(
      { caddy: 'caddy', postgres: 'postgres' },
      makeDeps(
        ['recipes-app'],
        { 'recipes-app': { caddy: 'caddyC', postgres: 'pgC' } },
        { caddyC: { '80/tcp': '80', '443/tcp': '443' }, pgC: { '5432/tcp': '5432' } },
      ),
    );
    expect(rows[0].url).toBe('https://localhost');
  });

  it('has a null url when https is not exposed (http-only caddy)', async () => {
    const rows = await collectDockerStacks(
      { caddy: 'caddy', postgres: 'postgres' },
      makeDeps(
        ['http-only'],
        { 'http-only': { caddy: 'caddyH', postgres: 'pgH' } },
        { caddyH: { '80/tcp': '8080', '443/tcp': null }, pgH: { '5432/tcp': '5432' } },
      ),
    );
    expect(rows[0]).toMatchObject({ http: '8080', https: null, url: null });
  });

  it('leaves postgres null when the postgres container is missing', async () => {
    const rows = await collectDockerStacks(
      { caddy: 'caddy', postgres: 'postgres' },
      makeDeps(
        ['no-db'],
        { 'no-db': { caddy: 'caddyN', postgres: null } },
        { caddyN: { '80/tcp': '8081', '443/tcp': '8481' } },
      ),
    );
    expect(rows[0]).toMatchObject({ postgres: null, url: 'https://localhost:8481' });
  });

  it('uses configured service names when looking up containers', async () => {
    const seen: Array<[string, string]> = [];
    const deps: CollectStacksDeps = {
      listProjects: async () => ['proj'],
      findContainer: async (project, service) => {
        seen.push([project, service]);
        return null;
      },
      hostPort: async () => null,
    };
    await collectDockerStacks({ caddy: 'proxy', postgres: 'db' }, deps);
    expect(seen).toEqual([
      ['proj', 'proxy'],
      ['proj', 'db'],
    ]);
  });

  it('sorts stacks lexicographically by project name (matching `sort -u`)', async () => {
    const projects = ['recipes-app-kan-23', 'recipes-app', 'recipes-app-kan-9'];
    const containers = Object.fromEntries(
      projects.map((p) => [p, { caddy: null, postgres: null }]),
    );
    const rows = await collectDockerStacks(
      { caddy: 'caddy', postgres: 'postgres' },
      makeDeps(projects, containers, {}),
    );
    expect(rows.map((r) => r.project)).toEqual([
      'recipes-app',
      'recipes-app-kan-23',
      'recipes-app-kan-9',
    ]);
  });
});
