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

  it('defaults host to 127.0.0.1 (loopback-only)', () => {
    const config = parseDaemonConfig({});
    expect(config.host).toBe('127.0.0.1');
  });

  it('honors CREW_HOST override (e.g. 0.0.0.0 inside docker)', () => {
    const config = parseDaemonConfig({ CREW_HOST: '0.0.0.0' });
    expect(config.host).toBe('0.0.0.0');
  });

  it('defaults startupEventsDir to ~/.crew/startup', () => {
    // The package-level test setup pins CREW_STARTUP_EVENTS_DIR in
    // process.env as a blanket watcher safety net; clear it here so the
    // schema's homedir() fallback is what we actually assert.
    const prev = process.env.CREW_STARTUP_EVENTS_DIR;
    delete process.env.CREW_STARTUP_EVENTS_DIR;
    try {
      const config = parseDaemonConfig({});
      expect(config.startupEventsDir).toBe(join(homedir(), '.crew', 'startup'));
    } finally {
      if (prev !== undefined) process.env.CREW_STARTUP_EVENTS_DIR = prev;
    }
  });

  it('honors CREW_STARTUP_EVENTS_DIR override', () => {
    const config = parseDaemonConfig({ CREW_STARTUP_EVENTS_DIR: '/tmp/custom-startup' });
    expect(config.startupEventsDir).toBe('/tmp/custom-startup');
  });
});
