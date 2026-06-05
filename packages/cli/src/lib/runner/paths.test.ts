import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ensureRunnerLogDir, runnerPaths, type EnsureLogDirDeps } from './paths.js';

describe('runnerPaths', () => {
  it('defaults pidfile under ~/.config/crew and logs under ~/.crew/runner', () => {
    const p = runnerPaths({});
    expect(p.pidFile).toBe(join(homedir(), '.config', 'crew', 'runner.pid'));
    expect(p.logDir).toBe(join(homedir(), '.crew', 'runner'));
    expect(p.logFile).toBe(join(homedir(), '.crew', 'runner', 'runner.log'));
  });

  it('honours CREW_CONFIG_DIR and CREW_RUNNER_LOG_DIR overrides', () => {
    const p = runnerPaths({ CREW_CONFIG_DIR: '/cfg', CREW_RUNNER_LOG_DIR: '/logs' });
    expect(p.pidFile).toBe('/cfg/runner.pid');
    expect(p.logDir).toBe('/logs');
    expect(p.logFile).toBe('/logs/runner.log');
  });
});

describe('ensureRunnerLogDir', () => {
  function deps(over: Partial<EnsureLogDirDeps> = {}): EnsureLogDirDeps {
    return { mkdir: vi.fn(), isWritable: () => true, ...over };
  }

  it('creates the resolved log dir and reports it writable', () => {
    const mkdir = vi.fn();
    const result = ensureRunnerLogDir({ CREW_RUNNER_LOG_DIR: '/logs' }, deps({ mkdir }));
    expect(mkdir).toHaveBeenCalledWith('/logs');
    expect(result).toEqual({ dir: '/logs', writable: true });
  });

  it('reports the dir non-writable when the writability probe fails', () => {
    const result = ensureRunnerLogDir(
      { CREW_RUNNER_LOG_DIR: '/logs' },
      deps({ isWritable: () => false }),
    );
    expect(result).toEqual({ dir: '/logs', writable: false });
  });

  it('swallows a mkdir failure and falls back to the writability probe', () => {
    const result = ensureRunnerLogDir(
      { CREW_RUNNER_LOG_DIR: '/logs' },
      deps({
        mkdir: () => {
          throw new Error('EACCES');
        },
        isWritable: () => false,
      }),
    );
    expect(result).toEqual({ dir: '/logs', writable: false });
  });
});
