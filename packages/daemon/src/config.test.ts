import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseDaemonConfig } from './config.js';

describe('parseDaemonConfig', () => {
  it('returns sensible defaults when no env vars are set', () => {
    const config = parseDaemonConfig({});
    const crewHome = join(homedir(), '.config', 'crew');

    expect(config.port).toBe(7773);
    expect(config.configDir).toBe(join(crewHome, 'projects'));
    expect(config.dbFile).toBe(join(crewHome, 'state.db'));
    expect(config.pidFile).toBe(join(crewHome, 'daemon.pid'));
    expect(config.logFile).toBe(join(crewHome, 'daemon.log'));
  });

  it('reads CREW_PORT and coerces to a number', () => {
    const config = parseDaemonConfig({ CREW_PORT: '9000' });
    expect(config.port).toBe(9000);
  });

  it('throws when CREW_PORT is non-numeric', () => {
    expect(() => parseDaemonConfig({ CREW_PORT: 'notaport' })).toThrow();
  });

  it('honors CREW_CONFIG_DIR override', () => {
    const config = parseDaemonConfig({ CREW_CONFIG_DIR: '/tmp/custom-projects' });
    expect(config.configDir).toBe('/tmp/custom-projects');
  });

  it('honors CREW_DB_FILE, CREW_PID_FILE, CREW_LOG_FILE overrides', () => {
    const config = parseDaemonConfig({
      CREW_DB_FILE: '/tmp/state.db',
      CREW_PID_FILE: '/tmp/daemon.pid',
      CREW_LOG_FILE: '/tmp/daemon.log',
    });
    expect(config.dbFile).toBe('/tmp/state.db');
    expect(config.pidFile).toBe('/tmp/daemon.pid');
    expect(config.logFile).toBe('/tmp/daemon.log');
  });

  it('ignores unrelated env vars', () => {
    const config = parseDaemonConfig({ PATH: '/usr/bin', NODE_ENV: 'test' });
    expect(config.port).toBe(7773);
  });
});
