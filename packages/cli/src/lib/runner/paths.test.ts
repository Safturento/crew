import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { runnerPaths } from './paths.js';

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
