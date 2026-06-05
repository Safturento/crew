import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { envMaterialized } from './env-materialized.js';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'crew-envmat-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function configFor(worktree: string): ProjectConfig {
  return {
    name: 'x',
    repo_path: worktree,
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: 'u/r' },
    docker: {
      canonical_worktree: basename(worktree),
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
  } as unknown as ProjectConfig;
}

describe('env-materialized', () => {
  it('is a project-scoped check with a fix', () => {
    expect(envMaterialized.scope).toBe('project');
    expect(typeof envMaterialized.fix).toBe('function');
  });

  it('ok when there is no env.toml (nothing to materialize)', async () => {
    const wt = tmp();
    const r = await envMaterialized.detect({ config: configFor(wt), worktree: wt });
    expect(r.status).toBe('ok');
  });

  it('ok when env.toml is present and .env exists', async () => {
    const wt = tmp();
    writeFileSync(join(wt, 'env.toml'), 'schema = 1\n');
    writeFileSync(join(wt, '.env'), 'FOO=bar\n');
    const r = await envMaterialized.detect({ config: configFor(wt), worktree: wt });
    expect(r.status).toBe('ok');
  });

  it('ok when env.toml is present and envVars are already materialized', async () => {
    const wt = tmp();
    writeFileSync(join(wt, 'env.toml'), 'schema = 1\n');
    const r = await envMaterialized.detect({
      config: configFor(wt),
      worktree: wt,
      envVars: { FOO: 'bar' },
    });
    expect(r.status).toBe('ok');
  });

  it('fails (fixable) when env.toml is present but .env is missing', async () => {
    const wt = tmp();
    writeFileSync(join(wt, 'env.toml'), 'schema = 1\n');
    const r = await envMaterialized.detect({ config: configFor(wt), worktree: wt });
    expect(r.status).toBe('fail');
    expect(r.fixable).toBe(true);
    expect(r.remediation).toContain('env init');
  });

  it('fix() materializes .env via runEnvInit', async () => {
    const wt = tmp();
    mkdirSync(wt, { recursive: true });
    writeFileSync(
      join(wt, 'env.toml'),
      [
        'schema = 1',
        '',
        '[orchestration]',
        'CREW_PORT = { kind = "port", default = 7773 }',
        'APP_URL = { kind = "template", value = "http://localhost:${CREW_PORT}" }',
        '',
      ].join('\n'),
    );
    const config = configFor(wt);
    expect(existsSync(join(wt, '.env'))).toBe(false);
    await envMaterialized.fix!({ config, worktree: wt });
    expect(existsSync(join(wt, '.env'))).toBe(true);
  });
});
