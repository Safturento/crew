import { describe, expect, it } from 'vitest';
import { mergeStartedAndCompleted, type StartupEventRow } from './startup-events-merge.js';

function row(over: Partial<StartupEventRow>): StartupEventRow {
  return {
    id: 1,
    agent_key: 'CREW-201',
    subtype: 'crew_startup_npm_install',
    status: 'started',
    ts: 1_700_000_000_000,
    summary: 'npm ci begun',
    duration_ms: null,
    log_path: null,
    ...over,
  };
}

describe('mergeStartedAndCompleted', () => {
  it('produces one StartupPhaseRow per phase from a started+completed pair', () => {
    const rows = [
      row({ id: 1, status: 'started', ts: 1000, summary: 'npm ci begun' }),
      row({
        id: 2,
        status: 'completed',
        ts: 2000,
        summary: 'installed 152 packages',
        duration_ms: 1000,
      }),
    ];
    const merged = mergeStartedAndCompleted(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: 'system',
      subtype: 'crew_startup_npm_install',
      startedAt: new Date(1000).toISOString(),
      completedAt: new Date(2000).toISOString(),
      status: 'completed',
      summary: 'installed 152 packages',
      durationMs: 1000,
      logPath: null,
    });
  });

  it('reports in_flight when no terminal event has arrived', () => {
    const merged = mergeStartedAndCompleted([
      row({ id: 1, status: 'started', ts: 1000, summary: 'npm ci begun' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      status: 'in_flight',
      startedAt: new Date(1000).toISOString(),
      completedAt: null,
      summary: 'npm ci begun',
      durationMs: null,
    });
  });

  it('reports failed status with terminal-event summary + logPath', () => {
    const merged = mergeStartedAndCompleted([
      row({ id: 1, status: 'started', ts: 1000, summary: 'npm ci begun' }),
      row({
        id: 2,
        status: 'failed',
        ts: 1500,
        summary: 'exit 1: cannot resolve foo',
        duration_ms: 500,
        log_path: '/tmp/crew-npm-install-CREW-201.log',
      }),
    ]);
    expect(merged[0]).toMatchObject({
      status: 'failed',
      summary: 'exit 1: cannot resolve foo',
      durationMs: 500,
      logPath: '/tmp/crew-npm-install-CREW-201.log',
    });
  });

  it('handles a terminal event with no preceding started (out of order)', () => {
    const merged = mergeStartedAndCompleted([
      row({
        id: 1,
        status: 'completed',
        ts: 2000,
        summary: 'docker healthy',
        duration_ms: 5_000,
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      status: 'completed',
      startedAt: new Date(2000).toISOString(),
      completedAt: new Date(2000).toISOString(),
      summary: 'docker healthy',
      durationMs: 5_000,
    });
  });

  it('produces one row per distinct subtype', () => {
    const merged = mergeStartedAndCompleted([
      row({ id: 1, subtype: 'crew_startup_preflight', status: 'started', ts: 1000 }),
      row({
        id: 2,
        subtype: 'crew_startup_preflight',
        status: 'completed',
        ts: 1100,
        summary: 'preflight ok',
        duration_ms: 100,
      }),
      row({
        id: 3,
        subtype: 'crew_startup_npm_install',
        status: 'started',
        ts: 1200,
        summary: 'npm ci begun',
      }),
      row({
        id: 4,
        subtype: 'crew_startup_npm_install',
        status: 'completed',
        ts: 1500,
        summary: 'installed 100 packages',
        duration_ms: 300,
      }),
    ]);
    expect(merged).toHaveLength(2);
    const subtypes = merged.map((r) => r.subtype);
    expect(new Set(subtypes).size).toBe(subtypes.length);
    expect(subtypes).toContain('crew_startup_preflight');
    expect(subtypes).toContain('crew_startup_npm_install');
  });

  it('returns an empty array for no input', () => {
    expect(mergeStartedAndCompleted([])).toEqual([]);
  });
});
