import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEnvInit, runEnvRefresh, runEnvValidate } from './env.js';
import type { ProjectConfig } from '../lib/index.js';

let dir: string;

const SPEC = `
schema = 1
[orchestration]
COMPOSE_PROJECT_NAME = { kind = "template", value = "\${BASE_NAME}-\${WORKTREE_ID}" }
HTTP_PORT = { kind = "port", default = 80 }
[app]
SECRET = { source = "generate", command = "echo deterministic" }
[contexts.docker-backend]
HTTP_PORT = "5555"
`;

const stubConfig = (canonical: string): ProjectConfig =>
  ({
    name: 'test',
    repo_path: dir,
    default_branch: 'main',
    jira: { project_key: 'KAN', site: 'https://x.atlassian.net' },
    github: { repo: 'x/y' },
    docker: {
      canonical_worktree: canonical,
      http_port_base: 8000,
      https_port_base: 8400,
      postgres_port_base: 15400,
      caddy_service: 'caddy',
      postgres_service: 'postgres',
    },
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    },
  }) as ProjectConfig;

function makeWorktree(name: string): string {
  const wt = join(dir, name);
  mkdirSync(wt, { recursive: true });
  writeFileSync(join(wt, 'env.toml'), SPEC);
  return wt;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crew-envcmd-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runEnvInit', () => {
  it('writes .env and per-context files using canonical defaults', async () => {
    const wt = makeWorktree('test-canonical');
    const result = await runEnvInit({
      worktree: wt,
      config: stubConfig('test-canonical'),
      log: () => {},
    });
    expect(result.ok).toBe(true);
    expect(readFileSync(join(wt, '.env'), 'utf8')).toMatch(/HTTP_PORT=80/);
    expect(readFileSync(join(wt, '.env'), 'utf8')).toMatch(/SECRET=deterministic/);
    expect(readFileSync(join(wt, '.env.docker-backend'), 'utf8')).toMatch(/HTTP_PORT=5555/);
  });

  it('uses allocator for non-canonical worktree', async () => {
    const wt = makeWorktree('test-canonical-kan-23');
    await runEnvInit({
      worktree: wt,
      config: stubConfig('test-canonical'),
      log: () => {},
    });
    const content = readFileSync(join(wt, '.env'), 'utf8');
    expect(content).not.toMatch(/HTTP_PORT=80\b/);
  });

  it('returns ok=false when env.toml is missing', async () => {
    const wt = join(dir, 'no-spec');
    mkdirSync(wt, { recursive: true });
    const result = await runEnvInit({
      worktree: wt,
      config: stubConfig('no-spec'),
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/env\.toml/);
  });
});

describe('runEnvRefresh', () => {
  it('preserves cached generated values across re-runs', async () => {
    const wt = makeWorktree('test-canonical');
    await runEnvInit({ worktree: wt, config: stubConfig('test-canonical'), log: () => {} });
    const first = readFileSync(join(wt, '.env'), 'utf8').match(/SECRET=(.*)/)?.[1];

    const swapped = readFileSync(join(wt, '.env'), 'utf8').replace(
      /SECRET=.*/,
      'SECRET=user-set-value',
    );
    writeFileSync(join(wt, '.env'), swapped);

    await runEnvRefresh({ worktree: wt, config: stubConfig('test-canonical'), log: () => {} });
    const second = readFileSync(join(wt, '.env'), 'utf8').match(/SECRET=(.*)/)?.[1];
    expect(second).toBe('user-set-value');
    expect(second).not.toBe(first);
  });
});

describe('runEnvValidate', () => {
  it('returns ok=true on a valid spec', async () => {
    const wt = makeWorktree('test-canonical');
    const result = await runEnvValidate({ worktree: wt, log: () => {} });
    expect(result.ok).toBe(true);
  });

  it('returns ok=false with reason on a parse error', async () => {
    const wt = makeWorktree('test-canonical');
    writeFileSync(join(wt, 'env.toml'), 'schema = 999\n');
    const result = await runEnvValidate({ worktree: wt, log: () => {} });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/schema/i);
  });

  it('returns ok=false with reason on a cycle', async () => {
    const wt = makeWorktree('test-canonical');
    writeFileSync(
      join(wt, 'env.toml'),
      `
schema = 1
[orchestration]
A = { kind = "template", value = "\${B}" }
B = { kind = "template", value = "\${A}" }
[app]
`,
    );
    const result = await runEnvValidate({ worktree: wt, log: () => {} });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/cycle/i);
  });
});
