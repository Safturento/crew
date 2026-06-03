import { describe, it, expect } from 'vitest';
import { formatDockerListTable, runDockerList } from './docker-list.js';
import type { DockerStackRow } from '../lib/index.js';

function row(overrides: Partial<DockerStackRow> = {}): DockerStackRow {
  return {
    project: 'recipes-app',
    http: '80',
    https: '443',
    postgres: '5432',
    url: 'https://localhost',
    ...overrides,
  };
}

describe('formatDockerListTable', () => {
  it('renders the PROJECT / HTTP / HTTPS / POSTGRES / URL header', () => {
    const out = formatDockerListTable([row()]);
    for (const head of ['PROJECT', 'HTTP', 'HTTPS', 'POSTGRES', 'URL']) {
      expect(out).toContain(head);
    }
  });

  it('renders a row with its project, ports and url', () => {
    const out = formatDockerListTable([
      row({
        project: 'recipes-app-kan-23',
        http: '8023',
        https: '8423',
        postgres: '15423',
        url: 'https://localhost:8423',
      }),
    ]);
    expect(out).toContain('recipes-app-kan-23');
    expect(out).toContain('8023');
    expect(out).toContain('8423');
    expect(out).toContain('15423');
    expect(out).toContain('https://localhost:8423');
  });

  it('renders missing values as an em-dash', () => {
    const out = formatDockerListTable([
      row({ project: 'http-only', https: null, postgres: null, url: null }),
    ]);
    expect(out).toContain('http-only');
    expect(out).toContain('—');
  });
});

describe('runDockerList', () => {
  it('prints the table when stacks are running', async () => {
    const logs: string[] = [];
    const result = await runDockerList({
      services: { caddy: 'caddy', postgres: 'postgres' },
      collect: async () => [row({ project: 'recipes-app-kan-23' })],
      log: (m) => logs.push(m),
    });
    expect(result.ok).toBe(true);
    expect(logs.join('\n')).toContain('recipes-app-kan-23');
  });

  it('prints a friendly message and succeeds when no stacks are running', async () => {
    const logs: string[] = [];
    const result = await runDockerList({
      services: { caddy: 'caddy', postgres: 'postgres' },
      collect: async () => [],
      log: (m) => logs.push(m),
    });
    expect(result.ok).toBe(true);
    expect(logs.join('\n')).toContain('No running docker compose stacks.');
  });

  it('fails with a clear reason when docker is missing from PATH', async () => {
    const enoent = Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' });
    const result = await runDockerList({
      services: { caddy: 'caddy', postgres: 'postgres' },
      collect: async () => {
        throw enoent;
      },
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/docker not found/i);
  });

  it('surfaces other docker errors verbatim', async () => {
    const result = await runDockerList({
      services: { caddy: 'caddy', postgres: 'postgres' },
      collect: async () => {
        throw new Error('docker daemon not running');
      },
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('docker daemon not running');
  });
});
