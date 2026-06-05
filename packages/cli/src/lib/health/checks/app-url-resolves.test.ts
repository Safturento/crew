import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { appUrlResolves } from './app-url-resolves.js';
import * as probeUrlModule from '../probe-url.js';

const cfgWithDockerAndPlaywright = (overrides: Partial<ProjectConfig> = {}): ProjectConfig =>
  ({
    canonical_worktree: 'main',
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: [],
    },
    docker: {
      canonical_worktree: 'main',
      http_port_base: 8000,
      https_port_base: 8400,
      postgres_port_base: 15400,
    },
    playwright: {
      app_url: 'https://localhost:17253',
      authored: {
        enabled: true,
        tests_dir: 'tests/e2e',
        test_command: 'npm run test:e2e',
        verify_after_run: false,
        verify_max_attempts: 2,
      },
    },
    ...overrides,
  }) as unknown as ProjectConfig;

describe('app-url-resolves check', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is ok without probing when no docker and no playwright/bruno', async () => {
    const probeSpy = vi.spyOn(probeUrlModule, 'probeUrl');
    const r = await appUrlResolves.detect({
      config: { canonical_worktree: 'main', db_clone: {} as never } as unknown as ProjectConfig,
      worktree: '/tmp/wt',
    });
    expect(r.status).toBe('ok');
    expect(probeSpy).not.toHaveBeenCalled();
  });

  it('skips the playwright url when start_command is set', async () => {
    const probeSpy = vi
      .spyOn(probeUrlModule, 'probeUrl')
      .mockResolvedValue({ reachable: true, attempts: 1 });
    const r = await appUrlResolves.detect({
      config: cfgWithDockerAndPlaywright({
        playwright: {
          app_url: 'https://localhost:17253',
          start_command: 'npm run dev',
          authored: {
            enabled: true,
            tests_dir: 'tests/e2e',
            test_command: 'npm run test:e2e',
            verify_after_run: false,
            verify_max_attempts: 2,
          },
        },
      } as unknown as Partial<ProjectConfig>),
      worktree: '/tmp/wt',
    });
    expect(r.status).toBe('ok');
    expect(probeSpy).not.toHaveBeenCalled();
  });

  it('probes the playwright app_url when docker configured + no start_command', async () => {
    const probeSpy = vi
      .spyOn(probeUrlModule, 'probeUrl')
      .mockResolvedValue({ reachable: true, attempts: 1 });
    const r = await appUrlResolves.detect({
      config: cfgWithDockerAndPlaywright(),
      worktree: '/tmp/wt',
    });
    expect(r.status).toBe('ok');
    expect(probeSpy).toHaveBeenCalledWith('https://localhost:17253');
  });

  it('does not probe when [playwright] is set but no smoke/authored mode is enabled', async () => {
    const probeSpy = vi.spyOn(probeUrlModule, 'probeUrl');
    const r = await appUrlResolves.detect({
      config: {
        ...cfgWithDockerAndPlaywright(),
        playwright: { app_url: 'https://localhost:17253' },
      } as unknown as ProjectConfig,
      worktree: '/tmp/wt',
    });
    expect(r.status).toBe('ok');
    expect(probeSpy).not.toHaveBeenCalled();
  });

  it('resolves the {httpsPort} placeholder via dockerPorts before probing', async () => {
    const probeSpy = vi
      .spyOn(probeUrlModule, 'probeUrl')
      .mockResolvedValue({ reachable: true, attempts: 1 });
    await appUrlResolves.detect({
      config: cfgWithDockerAndPlaywright({
        playwright: {
          app_url: 'https://localhost:{httpsPort}',
          authored: {
            enabled: true,
            tests_dir: 'tests/e2e',
            test_command: 'npm run test:e2e',
            verify_after_run: false,
            verify_max_attempts: 2,
          },
        },
      } as unknown as Partial<ProjectConfig>),
      worktree: '/tmp/wt',
      dockerPorts: { httpPort: 8001, httpsPort: 8401, postgresPort: 15401 },
    });
    expect(probeSpy).toHaveBeenCalledWith('https://localhost:8401');
  });

  it('resolves the ${VAR} placeholder via envVars before probing', async () => {
    const probeSpy = vi
      .spyOn(probeUrlModule, 'probeUrl')
      .mockResolvedValue({ reachable: true, attempts: 1 });
    await appUrlResolves.detect({
      config: cfgWithDockerAndPlaywright({
        playwright: {
          app_url: 'https://${APP_HOST}:${APP_PORT}',
          authored: {
            enabled: true,
            tests_dir: 'tests/e2e',
            test_command: 'npm run test:e2e',
            verify_after_run: false,
            verify_max_attempts: 2,
          },
        },
      } as unknown as Partial<ProjectConfig>),
      worktree: '/tmp/wt',
      envVars: { APP_HOST: 'localhost', APP_PORT: '17253' },
    });
    expect(probeSpy).toHaveBeenCalledWith('https://localhost:17253');
  });

  it('fails with the resolved URL (not the template) when the probe fails', async () => {
    vi.spyOn(probeUrlModule, 'probeUrl').mockResolvedValue({
      reachable: false,
      attempts: 5,
      lastError: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });

    const r = await appUrlResolves.detect({
      config: cfgWithDockerAndPlaywright({
        playwright: {
          app_url: 'https://localhost:{httpsPort}',
          authored: {
            enabled: true,
            tests_dir: 'tests/e2e',
            test_command: 'npm run test:e2e',
            verify_after_run: false,
            verify_max_attempts: 2,
          },
        },
      } as unknown as Partial<ProjectConfig>),
      worktree: '/tmp/wt',
      dockerPorts: { httpPort: 8001, httpsPort: 8401, postgresPort: 15401 },
    });

    expect(r.status).toBe('fail');
    expect(r.headline).toBe('app URL unreachable');
    expect(r.details?.url).toBe('https://localhost:8401 (from [playwright].app_url)');
    expect(r.details?.tried).toContain('5 attempts');
    expect(r.details?.tried).toContain('ECONNREFUSED');
    expect(r.remediation).toContain('crew restart');
    // Reachability is dispatch-runtime state, not auto-fixable.
    expect(r.fixable).toBeUndefined();
  });

  it('probes the bruno_smoke base_url when configured + docker', async () => {
    const probeSpy = vi
      .spyOn(probeUrlModule, 'probeUrl')
      .mockResolvedValue({ reachable: true, attempts: 1 });
    await appUrlResolves.detect({
      config: {
        ...cfgWithDockerAndPlaywright(),
        bruno_smoke: {
          enabled: true,
          base_url: 'https://localhost:17253',
          collection_dir: 'bruno',
        },
      } as unknown as ProjectConfig,
      worktree: '/tmp/wt',
    });
    // Probed twice — once for playwright, once for bruno.
    expect(probeSpy).toHaveBeenCalledTimes(2);
  });

  it('fails cleanly (no probe) when a ${VAR} cannot be resolved', async () => {
    const probeSpy = vi.spyOn(probeUrlModule, 'probeUrl');
    const r = await appUrlResolves.detect({
      config: cfgWithDockerAndPlaywright({
        playwright: {
          app_url: 'https://${APP_HOST}:1234',
          authored: {
            enabled: true,
            tests_dir: 'tests/e2e',
            test_command: 'npm run test:e2e',
            verify_after_run: false,
            verify_max_attempts: 2,
          },
        },
      } as unknown as Partial<ProjectConfig>),
      worktree: '/tmp/wt',
      // no envVars → ${APP_HOST} is unresolvable
    });

    expect(r.status).toBe('fail');
    expect(r.headline).toContain('unresolved');
    expect(r.remediation).toMatch(/env\.toml|crew env init/);
    expect(probeSpy).not.toHaveBeenCalled();
  });
});
