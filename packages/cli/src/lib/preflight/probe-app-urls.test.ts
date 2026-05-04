import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { probeAppUrlsCheck } from './probe-app-urls.js';
import { PreflightError } from './types.js';
import * as probeUrlModule from './probe-url.js';

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

describe('probeAppUrlsCheck', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('skips when no docker and no playwright/bruno_smoke', async () => {
    const probeSpy = vi.spyOn(probeUrlModule, 'probeUrl');
    const check = probeAppUrlsCheck();
    await check.run({
      config: {
        canonical_worktree: 'main',
        db_clone: {} as never,
      } as unknown as ProjectConfig,
      worktree: '/tmp/wt',
    });
    expect(probeSpy).not.toHaveBeenCalled();
  });

  it('skips playwright url when start_command is set', async () => {
    const probeSpy = vi
      .spyOn(probeUrlModule, 'probeUrl')
      .mockResolvedValue({ reachable: true, attempts: 1 });
    const check = probeAppUrlsCheck();
    await check.run({
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
    expect(probeSpy).not.toHaveBeenCalled();
  });

  it('probes playwright app_url when docker configured + no start_command', async () => {
    const probeSpy = vi
      .spyOn(probeUrlModule, 'probeUrl')
      .mockResolvedValue({ reachable: true, attempts: 1 });
    const check = probeAppUrlsCheck();
    await check.run({ config: cfgWithDockerAndPlaywright(), worktree: '/tmp/wt' });
    expect(probeSpy).toHaveBeenCalledWith('https://localhost:17253');
  });

  it('throws PreflightError with structured details when probe fails', async () => {
    vi.spyOn(probeUrlModule, 'probeUrl').mockResolvedValue({
      reachable: false,
      attempts: 5,
      lastError: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });

    const check = probeAppUrlsCheck();
    try {
      await check.run({ config: cfgWithDockerAndPlaywright(), worktree: '/tmp/wt' });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PreflightError);
      const pe = err as PreflightError;
      expect(pe.headline).toBe('app URL unreachable');
      expect(pe.details.url).toBe('https://localhost:17253 (from [playwright].app_url)');
      expect(pe.details.tried).toContain('5 attempts');
      expect(pe.details.tried).toContain('ECONNREFUSED');
      expect(pe.remediation).toContain('crew restart');
    }
  });

  it('probes bruno_smoke base_url when configured + docker', async () => {
    const probeSpy = vi
      .spyOn(probeUrlModule, 'probeUrl')
      .mockResolvedValue({ reachable: true, attempts: 1 });
    const check = probeAppUrlsCheck();
    await check.run({
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
    // Probed twice — once for playwright, once for bruno (same URL in this fixture, but
    // both call sites must be reached).
    expect(probeSpy).toHaveBeenCalledTimes(2);
  });
});
