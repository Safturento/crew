import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bracketStartupPhase } from './bracket.js';
import { startupEventsFilePath } from './writer.js';

let homeDir: string;

beforeEach(() => {
  homeDir = mkdtempSync(join(tmpdir(), 'crew-startup-bracket-'));
});

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function readEvents(key: string): Array<Record<string, unknown>> {
  const file = startupEventsFilePath(key, homeDir);
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('bracketStartupPhase', () => {
  it('emits started + completed when the work resolves', async () => {
    const result = await bracketStartupPhase(
      'CREW-201',
      {
        subtype: 'crew_startup_npm_install',
        startedSummary: 'npm ci begun',
        completedSummary: (out: { count: number }) => `installed ${out.count} packages`,
      },
      async () => ({ count: 152 }),
      { home: homeDir },
    );

    expect(result).toEqual({ count: 152 });
    const events = readEvents('CREW-201');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: 'system',
      subtype: 'crew_startup_npm_install',
      status: 'started',
      summary: 'npm ci begun',
    });
    expect(events[1]).toMatchObject({
      type: 'system',
      subtype: 'crew_startup_npm_install',
      status: 'completed',
      summary: 'installed 152 packages',
    });
    expect(typeof events[1].durationMs).toBe('number');
    expect((events[1].durationMs as number) >= 0).toBe(true);
  });

  it('emits started + failed when the work throws, then re-throws', async () => {
    const err = new Error('exit 1: cannot resolve foo');
    await expect(
      bracketStartupPhase(
        'CREW-201',
        {
          subtype: 'crew_startup_npm_install',
          startedSummary: 'npm ci begun',
          completedSummary: () => 'ok',
          failedLogPath: '/tmp/crew-npm-install-CREW-201.log',
        },
        async () => {
          throw err;
        },
        { home: homeDir },
      ),
    ).rejects.toBe(err);

    const events = readEvents('CREW-201');
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      type: 'system',
      subtype: 'crew_startup_npm_install',
      status: 'failed',
      summary: 'exit 1: cannot resolve foo',
      logPath: '/tmp/crew-npm-install-CREW-201.log',
    });
    expect(typeof events[1].durationMs).toBe('number');
  });

  it('passes logPath on the completed event when configured', async () => {
    await bracketStartupPhase(
      'CREW-201',
      {
        subtype: 'crew_startup_docker',
        startedSummary: 'docker compose up begun',
        completedSummary: () => 'all services healthy',
        completedLogPath: '/tmp/crew-docker-CREW-201.log',
      },
      async () => undefined,
      { home: homeDir },
    );

    const events = readEvents('CREW-201');
    expect(events[1].logPath).toBe('/tmp/crew-docker-CREW-201.log');
  });

  it('allows derived logPath from the work result', async () => {
    await bracketStartupPhase(
      'CREW-201',
      {
        subtype: 'crew_startup_mcp',
        startedSummary: 'writing .mcp.json',
        completedSummary: () => 'wrote .mcp.json',
        completedLogPath: (out: { logPath: string }) => out.logPath,
      },
      async () => ({ logPath: '/tmp/crew-mcp-CREW-201.log' }),
      { home: homeDir },
    );

    const events = readEvents('CREW-201');
    expect(events[1].logPath).toBe('/tmp/crew-mcp-CREW-201.log');
  });

  it('stringifies non-Error throws on the failed summary', async () => {
    await expect(
      bracketStartupPhase(
        'CREW-201',
        {
          subtype: 'crew_startup_preflight',
          startedSummary: 'preflight begun',
          completedSummary: () => 'ok',
        },
        async () => {
          throw 'plain string failure';
        },
        { home: homeDir },
      ),
    ).rejects.toBe('plain string failure');

    const events = readEvents('CREW-201');
    expect(events[1].summary).toBe('plain string failure');
  });
});
