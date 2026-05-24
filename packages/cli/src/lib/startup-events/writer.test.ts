import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  emitStartupEvent,
  startupEventsFilePath,
  startupEventsRootForHome,
} from './writer.js';

let homeDir: string;

beforeEach(() => {
  homeDir = mkdtempSync(join(tmpdir(), 'crew-startup-writer-'));
});

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true });
});

describe('startupEventsRootForHome', () => {
  it('returns ~/.crew/startup', () => {
    expect(startupEventsRootForHome(homeDir)).toBe(join(homeDir, '.crew', 'startup'));
  });
});

describe('startupEventsFilePath', () => {
  it('returns ~/.crew/startup/<key>.jsonl', () => {
    expect(startupEventsFilePath('CREW-201', homeDir)).toBe(
      join(homeDir, '.crew', 'startup', 'CREW-201.jsonl'),
    );
  });
});

describe('emitStartupEvent', () => {
  it('appends a single JSON line to the agent file', async () => {
    await emitStartupEvent(
      'CREW-201',
      {
        type: 'system',
        subtype: 'crew_startup_npm_install',
        status: 'started',
        timestamp: '2026-05-23T10:00:00.000Z',
        summary: 'npm ci begun',
      },
      { home: homeDir },
    );

    const file = startupEventsFilePath('CREW-201', homeDir);
    const contents = readFileSync(file, 'utf8');
    expect(contents.endsWith('\n')).toBe(true);
    const lines = contents.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      type: 'system',
      subtype: 'crew_startup_npm_install',
      status: 'started',
      timestamp: '2026-05-23T10:00:00.000Z',
      summary: 'npm ci begun',
    });
  });

  it('creates the ~/.crew/startup directory if absent', async () => {
    await emitStartupEvent(
      'CREW-999',
      {
        type: 'system',
        subtype: 'crew_startup_preflight',
        status: 'completed',
        timestamp: '2026-05-23T10:00:00.000Z',
        summary: 'preflight ok',
        durationMs: 100,
      },
      { home: homeDir },
    );

    const file = startupEventsFilePath('CREW-999', homeDir);
    expect(() => readFileSync(file, 'utf8')).not.toThrow();
  });

  it('appends successive events as separate JSONL lines', async () => {
    await emitStartupEvent(
      'CREW-201',
      {
        type: 'system',
        subtype: 'crew_startup_docker',
        status: 'started',
        timestamp: '2026-05-23T10:00:00.000Z',
        summary: 'docker compose up begun',
      },
      { home: homeDir },
    );
    await emitStartupEvent(
      'CREW-201',
      {
        type: 'system',
        subtype: 'crew_startup_docker',
        status: 'completed',
        timestamp: '2026-05-23T10:00:05.000Z',
        summary: 'all services healthy',
        durationMs: 5000,
      },
      { home: homeDir },
    );

    const contents = readFileSync(startupEventsFilePath('CREW-201', homeDir), 'utf8');
    const lines = contents.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).status).toBe('started');
    expect(JSON.parse(lines[1]).status).toBe('completed');
    expect(JSON.parse(lines[1]).durationMs).toBe(5000);
  });

  it('preserves optional logPath on failed events', async () => {
    await emitStartupEvent(
      'CREW-201',
      {
        type: 'system',
        subtype: 'crew_startup_npm_install',
        status: 'failed',
        timestamp: '2026-05-23T10:00:00.000Z',
        summary: 'exit 1: cannot resolve foo',
        durationMs: 1500,
        logPath: '/tmp/crew-npm-install-CREW-201.log',
      },
      { home: homeDir },
    );

    const contents = readFileSync(startupEventsFilePath('CREW-201', homeDir), 'utf8');
    const parsed = JSON.parse(contents.trim());
    expect(parsed.logPath).toBe('/tmp/crew-npm-install-CREW-201.log');
  });
});
