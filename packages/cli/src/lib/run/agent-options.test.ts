import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import {
  brunoSmokeOptionsFor,
  needsDockerPorts,
  playwrightFixPrOptsFor,
  playwrightTicketOptsFor,
  readDockerPortsFromEnvFile,
} from './agent-options.js';

function baseConfig(): ProjectConfig {
  return {
    name: 'test',
    repo_path: '/repo',
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: 'a/b' },
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    },
  } as ProjectConfig;
}

describe('readDockerPortsFromEnvFile', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'crew-agent-opts-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('parses CADDY_HTTP_PORT, CADDY_HTTPS_PORT, POSTGRES_PORT from .env', () => {
    writeFileSync(
      join(tmp, '.env'),
      'CADDY_HTTP_PORT=8001\nCADDY_HTTPS_PORT=8443\nPOSTGRES_PORT=15432\n',
    );
    expect(readDockerPortsFromEnvFile(tmp)).toEqual({
      httpPort: 8001,
      httpsPort: 8443,
      postgresPort: 15432,
    });
  });

  it('throws a helpful error when .env is missing', () => {
    expect(() => readDockerPortsFromEnvFile(tmp)).toThrow(/\.env not found/);
  });

  it('throws when a required port is missing', () => {
    writeFileSync(join(tmp, '.env'), 'CADDY_HTTP_PORT=8001\n');
    expect(() => readDockerPortsFromEnvFile(tmp)).toThrow(/CADDY_HTTPS_PORT/);
  });
});

describe('needsDockerPorts', () => {
  it('returns false when neither bruno_smoke nor playwright has placeholders', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'http://localhost:3000',
      collection_dir: 'bruno',
    };
    expect(needsDockerPorts(cfg)).toBe(false);
  });

  it('returns true when bruno_smoke has a port placeholder', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'https://localhost:{httpsPort}',
      collection_dir: 'bruno',
    };
    expect(needsDockerPorts(cfg)).toBe(true);
  });

  it('returns true when playwright app_url has a port placeholder', () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'https://localhost:{httpsPort}',
      smoke: { enabled: true },
    };
    expect(needsDockerPorts(cfg)).toBe(true);
  });

  it('returns false when both are unconfigured', () => {
    expect(needsDockerPorts(baseConfig())).toBe(false);
  });
});

describe('brunoSmokeOptionsFor', () => {
  it('returns undefined when bruno_smoke is not enabled', () => {
    expect(brunoSmokeOptionsFor(baseConfig(), '/wt/main')).toBeUndefined();
  });

  it('throws when bruno_smoke uses a port placeholder without [docker]', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'https://localhost:{httpsPort}',
      collection_dir: 'bruno',
    };
    expect(() => brunoSmokeOptionsFor(cfg, '/wt/main')).toThrow(/port|docker/i);
  });

  it('returns the resolved options when bruno_smoke is enabled', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'http://localhost:3000',
      collection_dir: 'bruno',
    };
    const opts = brunoSmokeOptionsFor(cfg, '/wt/Recipes-App-KAN-99');
    expect(opts).toEqual({
      baseUrl: 'http://localhost:3000',
      envName: 'recipes-app-kan-99',
      collectionDir: 'bruno',
      hasSmokeUser: false,
    });
  });

  it('reports hasSmokeUser true when smoke_user is configured', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'http://localhost:3000',
      collection_dir: 'bruno',
      smoke_user: { email: 'a', username: 'b', password: 'c' },
    };
    const opts = brunoSmokeOptionsFor(cfg, '/wt/main');
    expect(opts?.hasSmokeUser).toBe(true);
  });

  it('does not read .env when base_url has no port placeholder, even with [docker] set', () => {
    const cfg = baseConfig();
    cfg.docker = {
      canonical_worktree: 'main',
      http_port_base: 8000,
      https_port_base: 8400,
      postgres_port_base: 15400,
    };
    cfg.bruno_smoke = {
      enabled: true,
      base_url: 'http://localhost:3000',
      collection_dir: 'bruno',
    };
    const opts = brunoSmokeOptionsFor(cfg, '/wt/missing');
    expect(opts).toEqual({
      baseUrl: 'http://localhost:3000',
      envName: 'missing',
      collectionDir: 'bruno',
      hasSmokeUser: false,
    });
  });
});

describe('playwrightFixPrOptsFor', () => {
  it('returns undefined when playwright is not enabled', () => {
    expect(playwrightFixPrOptsFor(baseConfig(), 'https://localhost:8443')).toBeUndefined();
  });

  it('returns undefined when resolvedAppUrl is undefined', () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'https://localhost:18443', smoke: { enabled: true } };
    expect(playwrightFixPrOptsFor(cfg, undefined)).toBeUndefined();
  });

  it('returns appUrl-only options when authored is not enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'https://localhost:18443', smoke: { enabled: true } };
    const opts = playwrightFixPrOptsFor(cfg, 'https://localhost:18443');
    expect(opts).toEqual({ appUrl: 'https://localhost:18443' });
  });

  it('includes authored when authored is enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'https://localhost:18443',
      authored: {
        enabled: true,
        tests_dir: 'tests/e2e',
        test_command: 'npm run test:e2e',
        verify_after_run: false,
        verify_max_attempts: 2,
      },
    };
    const opts = playwrightFixPrOptsFor(cfg, 'https://localhost:18443');
    expect(opts).toEqual({
      appUrl: 'https://localhost:18443',
      authored: { testsDir: 'tests/e2e', testCommand: 'npm run test:e2e' },
    });
  });
});

describe('playwrightTicketOptsFor', () => {
  it('returns undefined when playwright is not enabled', () => {
    expect(playwrightTicketOptsFor(baseConfig(), 'https://localhost:8443')).toBeUndefined();
  });

  it('returns undefined when resolvedAppUrl is undefined', () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'https://localhost:18443', smoke: { enabled: true } };
    expect(playwrightTicketOptsFor(cfg, undefined)).toBeUndefined();
  });

  it('includes smoke + startCommand fields', () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'https://localhost:18443',
      start_command: 'npm run dev',
      smoke: { enabled: true },
    };
    const opts = playwrightTicketOptsFor(cfg, 'https://localhost:18443');
    expect(opts).toEqual({
      appUrl: 'https://localhost:18443',
      startCommand: 'npm run dev',
      smoke: true,
      authored: undefined,
    });
  });

  it('omits smoke field when only authored is configured', () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'https://localhost:18443',
      authored: {
        enabled: true,
        tests_dir: 'tests/e2e',
        test_command: 'npm run test:e2e',
        verify_after_run: false,
        verify_max_attempts: 2,
      },
    };
    const opts = playwrightTicketOptsFor(cfg, 'https://localhost:18443');
    expect(opts?.smoke).toBeUndefined();
    expect(opts?.authored).toEqual({
      testsDir: 'tests/e2e',
      testCommand: 'npm run test:e2e',
      verifyAfterRun: false,
    });
  });

  it('propagates verifyAfterRun=true when configured', () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'https://localhost:18443',
      authored: {
        enabled: true,
        tests_dir: 'tests/e2e',
        test_command: 'npm run test:e2e',
        verify_after_run: true,
        verify_max_attempts: 2,
      },
    };
    const opts = playwrightTicketOptsFor(cfg, 'https://localhost:18443');
    expect(opts?.authored?.verifyAfterRun).toBe(true);
  });
});
