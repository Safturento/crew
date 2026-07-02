import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectConfig } from 'crew-shared';

vi.mock('../docker/ensure-stack-running.js', () => ({
  ensureStackRunning: vi.fn(),
}));
vi.mock('../docker/start-bringup.js', () => ({
  startDockerBringup: vi.fn(),
}));
vi.mock('../mcp-config/install-browsers.js', () => ({
  installPlaywrightBrowsers: vi.fn(),
}));
vi.mock('./install-node-modules.js', () => ({
  installNodeModules: vi.fn(),
}));
// Mock the leaf so the barrel (`../preflight/index.js`) re-exports the stubbed
// runPreflight while keeping the real PreflightError.
vi.mock('../preflight/run-preflight.js', () => ({
  runPreflight: vi.fn(),
}));
// Record which phases get bracketed without touching `~/.crew` on disk. The
// stub just runs the work fn, preserving each caller's throw/return semantics
// (bracket.ts's started/failed emission is covered by its own unit test).
vi.mock('../startup-events/index.js', () => ({
  bracketStartupPhase: vi.fn(
    async (_key: string, _spec: { subtype: string }, work: () => Promise<unknown>) => work(),
  ),
}));

import { ensureStackRunning } from '../docker/ensure-stack-running.js';
import { startDockerBringup } from '../docker/start-bringup.js';
import { installPlaywrightBrowsers } from '../mcp-config/install-browsers.js';
import { installNodeModules } from './install-node-modules.js';
import { runPreflight, PreflightError } from '../preflight/index.js';
import { bracketStartupPhase } from '../startup-events/index.js';
import { prepareAgentEnvironment } from './agent-environment.js';

const ensureMock = vi.mocked(ensureStackRunning);
const startBringupMock = vi.mocked(startDockerBringup);
const installMock = vi.mocked(installPlaywrightBrowsers);
const npmInstallMock = vi.mocked(installNodeModules);
const runPreflightMock = vi.mocked(runPreflight);
const bracketMock = vi.mocked(bracketStartupPhase);

/** Subtypes passed to `bracketStartupPhase` across all recorded calls. */
function bracketedSubtypes(): string[] {
  return bracketMock.mock.calls.map((c) => (c[1] as { subtype: string }).subtype);
}

// Clear recorded bracket calls between every test (mockClear keeps the
// run-the-work implementation; mockReset would strip it).
beforeEach(() => {
  bracketMock.mockClear();
});

function baseConfig(): ProjectConfig {
  return {
    name: 'test',
    repo_path: '/repo',
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net', ready_status: 'Ready for Development' },
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

function configWithDocker(): ProjectConfig {
  const cfg = baseConfig();
  cfg.docker = {
    canonical_worktree: 'main',
    http_port_base: 8000,
    https_port_base: 8400,
    postgres_port_base: 15400,
    caddy_service: 'caddy',
    postgres_service: 'postgres',
  };
  return cfg;
}

function fakeBringupProc(exitCode = 0): ReturnType<typeof startDockerBringup> {
  return Promise.resolve({ exitCode }) as unknown as ReturnType<typeof startDockerBringup>;
}

describe('prepareAgentEnvironment — fresh mode', () => {
  beforeEach(() => {
    ensureMock.mockReset();
    startBringupMock.mockReset();
    installMock.mockReset();
    npmInstallMock.mockReset();
    npmInstallMock.mockResolvedValue({ rc: 0, logPath: '/tmp/crew-npm-install-KAN-1.log' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    runPreflightMock.mockReset();
    runPreflightMock.mockResolvedValue(undefined);
  });

  it('delegates docker bringup to startDockerBringup and returns the handle', async () => {
    const fakeProc = fakeBringupProc();
    startBringupMock.mockReturnValue(fakeProc);

    const result = await prepareAgentEnvironment({
      config: configWithDocker(),
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'fresh',
    });

    expect(startBringupMock).toHaveBeenCalledTimes(1);
    expect(ensureMock).not.toHaveBeenCalled();
    expect(result.dockerProcess).toBe(fakeProc);
  });

  it('does not call ensureStackRunning even when agent needs app', async () => {
    const cfg = configWithDocker();
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'b' };
    startBringupMock.mockReturnValue(fakeBringupProc());

    await prepareAgentEnvironment({
      config: cfg,
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'fresh',
    });

    expect(ensureMock).not.toHaveBeenCalled();
  });

  it('passes skipDocker through to startDockerBringup', async () => {
    startBringupMock.mockReturnValue(null);

    await prepareAgentEnvironment({
      config: configWithDocker(),
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'fresh',
      skipDocker: true,
    });

    const call = startBringupMock.mock.calls[0]?.[0] as { skip: boolean };
    expect(call.skip).toBe(true);
  });

  it('awaits the bringup process before returning', async () => {
    const events: string[] = [];
    startBringupMock.mockImplementation(() => {
      const proc = (async () => {
        await new Promise((r) => setTimeout(r, 10));
        events.push('docker-done');
        return { exitCode: 0 };
      })() as unknown as ReturnType<typeof startDockerBringup>;
      return proc;
    });

    await prepareAgentEnvironment({
      config: configWithDocker(),
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'fresh',
    });
    events.push('returned');
    expect(events).toEqual(['docker-done', 'returned']);
  });

  it('throws when fresh-mode bringup exits non-zero', async () => {
    startBringupMock.mockReturnValue(fakeBringupProc(2));

    await expect(
      prepareAgentEnvironment({
        config: configWithDocker(),
        worktree: '/wt',
        key: 'KAN-1',
        env: process.env,
        mode: 'fresh',
      }),
    ).rejects.toThrow(/docker bringup failed/i);
  });
});

describe('prepareAgentEnvironment — resume mode docker step', () => {
  beforeEach(() => {
    ensureMock.mockReset();
    startBringupMock.mockReset();
    installMock.mockReset();
    npmInstallMock.mockReset();
    npmInstallMock.mockResolvedValue({ rc: 0, logPath: '/tmp/crew-npm-install-KAN-1.log' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    runPreflightMock.mockReset();
    runPreflightMock.mockResolvedValue(undefined);
  });

  it('calls ensureStackRunning when agent needs app and [docker] is set', async () => {
    const cfg = configWithDocker();
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'b' };
    ensureMock.mockResolvedValue({ rc: 0, logPath: '/tmp/d.log' });

    const result = await prepareAgentEnvironment({
      config: cfg,
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'resume',
    });

    expect(ensureMock).toHaveBeenCalledWith({
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
    });
    expect(startBringupMock).not.toHaveBeenCalled();
    expect(result.dockerProcess).toBeUndefined();
  });

  it('also brings up the stack for bruno-only projects (no playwright)', async () => {
    const cfg = configWithDocker();
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'b' };
    ensureMock.mockResolvedValue({ rc: 0, logPath: '/tmp/d.log' });

    await prepareAgentEnvironment({
      config: cfg,
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'resume',
    });

    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(installMock).not.toHaveBeenCalled();
  });

  it('skips ensureStackRunning when agent does not need app', async () => {
    await prepareAgentEnvironment({
      config: configWithDocker(),
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'resume',
    });

    expect(ensureMock).not.toHaveBeenCalled();
  });

  it('skips ensureStackRunning when [docker] is not configured', async () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'b' };

    await prepareAgentEnvironment({
      config: cfg,
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'resume',
    });

    expect(ensureMock).not.toHaveBeenCalled();
  });

  it('skips ensureStackRunning when skipDocker is true', async () => {
    const cfg = configWithDocker();
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'b' };

    await prepareAgentEnvironment({
      config: cfg,
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'resume',
      skipDocker: true,
    });

    expect(ensureMock).not.toHaveBeenCalled();
  });

  it('throws when ensureStackRunning returns non-zero rc, embedding log path', async () => {
    const cfg = configWithDocker();
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'b' };
    ensureMock.mockResolvedValue({ rc: 1, logPath: '/tmp/crew-docker-KAN-1.log' });

    await expect(
      prepareAgentEnvironment({
        config: cfg,
        worktree: '/wt',
        key: 'KAN-1',
        env: process.env,
        mode: 'resume',
      }),
    ).rejects.toThrow(/docker.*KAN-1\.log/);
  });
});

describe('prepareAgentEnvironment — playwright steps', () => {
  beforeEach(() => {
    ensureMock.mockReset();
    startBringupMock.mockReset();
    installMock.mockReset();
    npmInstallMock.mockReset();
    npmInstallMock.mockResolvedValue({ rc: 0, logPath: '/tmp/crew-npm-install-KAN-1.log' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    runPreflightMock.mockReset();
    runPreflightMock.mockResolvedValue(undefined);
  });

  it('resolves playwright.app_url against dockerPorts when enabled', async () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'https://localhost:{httpsPort}',
      smoke: { enabled: true },
    };
    installMock.mockResolvedValue({ rc: 0, logPath: '/tmp/pw.log' });

    const result = await prepareAgentEnvironment({
      config: cfg,
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      dockerPorts: { httpPort: 8001, httpsPort: 8401, postgresPort: 15401 },
      mode: 'fresh',
    });

    expect(result.resolvedAppUrl).toBe('https://localhost:8401');
  });

  it('skips chromium install and URL resolution when playwright is disabled', async () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'b' };

    const result = await prepareAgentEnvironment({
      config: cfg,
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'fresh',
    });

    expect(result.resolvedAppUrl).toBeUndefined();
    expect(installMock).not.toHaveBeenCalled();
  });

  it('runs chromium install with the supplied env and returns the log path', async () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'http://localhost:3000', smoke: { enabled: true } };
    installMock.mockResolvedValue({ rc: 0, logPath: '/tmp/crew-playwright-KAN-1.log' });

    const result = await prepareAgentEnvironment({
      config: cfg,
      worktree: '/wt',
      key: 'KAN-1',
      env: { PATH: '/usr/bin' },
      mode: 'fresh',
    });

    expect(installMock).toHaveBeenCalledWith({
      worktree: '/wt',
      key: 'KAN-1',
      env: { PATH: '/usr/bin' },
    });
    expect(result.playwrightLogPath).toBe('/tmp/crew-playwright-KAN-1.log');
  });

  it('throws when chromium install fails, embedding log path', async () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'http://localhost:3000', smoke: { enabled: true } };
    installMock.mockResolvedValue({ rc: 1, logPath: '/tmp/crew-playwright-KAN-1.log' });

    await expect(
      prepareAgentEnvironment({
        config: cfg,
        worktree: '/wt',
        key: 'KAN-1',
        env: process.env,
        mode: 'fresh',
      }),
    ).rejects.toThrow(/playwright.*KAN-1\.log/);
  });

  it('runs npm install before chromium install when playwright is enabled', async () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'http://localhost:3000', smoke: { enabled: true } };
    const events: string[] = [];
    npmInstallMock.mockImplementation(async () => {
      events.push('npm-install');
      return { rc: 0, logPath: '/tmp/crew-npm-install-KAN-1.log' };
    });
    installMock.mockImplementation(async () => {
      events.push('chromium-install');
      return { rc: 0, logPath: '/tmp/crew-playwright-KAN-1.log' };
    });

    await prepareAgentEnvironment({
      config: cfg,
      worktree: '/wt',
      key: 'KAN-1',
      env: { PATH: '/usr/bin' },
      mode: 'fresh',
    });

    expect(npmInstallMock).toHaveBeenCalledWith({
      worktree: '/wt',
      key: 'KAN-1',
      env: { PATH: '/usr/bin' },
    });
    expect(events).toEqual(['npm-install', 'chromium-install']);
  });

  it('skips npm install when playwright is disabled', async () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'b' };

    await prepareAgentEnvironment({
      config: cfg,
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'fresh',
    });

    expect(npmInstallMock).not.toHaveBeenCalled();
  });

  it('throws when npm install fails, embedding log path and skipping chromium install', async () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'http://localhost:3000', smoke: { enabled: true } };
    npmInstallMock.mockResolvedValue({ rc: 1, logPath: '/tmp/crew-npm-install-KAN-1.log' });

    await expect(
      prepareAgentEnvironment({
        config: cfg,
        worktree: '/wt',
        key: 'KAN-1',
        env: process.env,
        mode: 'fresh',
      }),
    ).rejects.toThrow(/npm install.*KAN-1\.log/);

    expect(installMock).not.toHaveBeenCalled();
  });
});

describe('prepareAgentEnvironment — preflight integration', () => {
  beforeEach(() => {
    ensureMock.mockReset();
    startBringupMock.mockReset();
    installMock.mockReset();
    npmInstallMock.mockReset();
    npmInstallMock.mockResolvedValue({ rc: 0, logPath: '/tmp/crew-npm-install-KAN-1.log' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    runPreflightMock.mockReset();
    runPreflightMock.mockResolvedValue(undefined);
  });

  it('runs preflight after docker bringup completes', async () => {
    const events: string[] = [];

    startBringupMock.mockImplementation(() => {
      events.push('docker-started');
      return Promise.resolve({ exitCode: 0 }) as unknown as ReturnType<typeof startDockerBringup>;
    });

    runPreflightMock.mockImplementation(async () => {
      events.push('preflight-ran');
    });

    await prepareAgentEnvironment({
      config: configWithDocker(),
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'fresh',
    });

    expect(events).toEqual(['docker-started', 'preflight-ran']);
  });

  it('brackets the dispatch preflight as crew_startup_dispatch_preflight', async () => {
    await prepareAgentEnvironment({
      config: configWithDocker(),
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'fresh',
    });

    expect(bracketedSubtypes()).toContain('crew_startup_dispatch_preflight');
  });

  it('records the dispatch-preflight phase even when the gate fails', async () => {
    startBringupMock.mockReturnValue(
      Promise.resolve({ exitCode: 0 }) as unknown as ReturnType<typeof startDockerBringup>,
    );
    runPreflightMock.mockRejectedValue(new PreflightError('fail', 'forced failure', 'fix it'));

    await expect(
      prepareAgentEnvironment({
        config: configWithDocker(),
        worktree: '/wt',
        key: 'KAN-1',
        env: process.env,
        mode: 'fresh',
      }),
    ).rejects.toBeInstanceOf(PreflightError);

    // The bracket wrapped the throwing gate (its own unit test covers that the
    // wrapper emits a `failed` event before re-throwing).
    expect(bracketedSubtypes()).toContain('crew_startup_dispatch_preflight');
  });

  it('brackets the Chromium install as crew_startup_playwright_install', async () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'http://localhost:3000', smoke: { enabled: true } };
    installMock.mockResolvedValue({ rc: 0, logPath: '/tmp/crew-playwright-KAN-1.log' });

    await prepareAgentEnvironment({
      config: cfg,
      worktree: '/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'fresh',
    });

    expect(bracketedSubtypes()).toContain('crew_startup_playwright_install');
  });

  it('propagates PreflightError out of prepareAgentEnvironment', async () => {
    startBringupMock.mockReturnValue(
      Promise.resolve({ exitCode: 0 }) as unknown as ReturnType<typeof startDockerBringup>,
    );

    runPreflightMock.mockRejectedValue(new PreflightError('fail', 'forced failure', 'fix it'));

    await expect(
      prepareAgentEnvironment({
        config: configWithDocker(),
        worktree: '/wt',
        key: 'KAN-1',
        env: process.env,
        mode: 'fresh',
      }),
    ).rejects.toBeInstanceOf(PreflightError);
  });
});
