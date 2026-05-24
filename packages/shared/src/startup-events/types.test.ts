import { describe, it, expect } from 'vitest';
import {
  startupEventSchema,
  STARTUP_PHASE_SUBTYPES,
  type StartupEvent,
  type StartupPhaseRow,
  type StartupPhaseSubtype,
} from './types.js';
import type { TranscriptEvent } from '../transcripts/index.js';

describe('StartupEvent', () => {
  it('shape pin for started event', () => {
    const e: StartupEvent = {
      type: 'system',
      subtype: 'crew_startup_npm_install',
      status: 'started',
      timestamp: '2026-05-23T10:00:00.000Z',
      summary: 'npm ci begun',
    };
    expect(e.type).toBe('system');
    expect(e.status).toBe('started');
  });

  it('shape pin for completed event with durationMs', () => {
    const e: StartupEvent = {
      type: 'system',
      subtype: 'crew_startup_npm_install',
      status: 'completed',
      timestamp: '2026-05-23T10:00:00.000Z',
      summary: 'installed 152 packages',
      durationMs: 1234,
    };
    expect(e.durationMs).toBe(1234);
  });

  it('shape pin for failed event with logPath', () => {
    const e: StartupEvent = {
      type: 'system',
      subtype: 'crew_startup_npm_install',
      status: 'failed',
      timestamp: '2026-05-23T10:00:00.000Z',
      summary: 'exit 1: cannot resolve foo',
      durationMs: 500,
      logPath: '/tmp/crew-npm-install-A.log',
    };
    expect(e.logPath).toBe('/tmp/crew-npm-install-A.log');
  });

  it('STARTUP_PHASE_SUBTYPES lists all 7 phases', () => {
    expect(STARTUP_PHASE_SUBTYPES).toEqual([
      'crew_startup_preflight',
      'crew_startup_worktree',
      'crew_startup_env_spec',
      'crew_startup_npm_install',
      'crew_startup_docker',
      'crew_startup_mcp',
      'crew_startup_claude_spawn',
    ]);
  });

  it('startupEventSchema parses a valid completed event', () => {
    const parsed = startupEventSchema.parse({
      type: 'system',
      subtype: 'crew_startup_docker',
      status: 'completed',
      timestamp: '2026-05-23T10:01:00.000Z',
      summary: 'All services healthy',
      durationMs: 4321,
    });
    expect(parsed.subtype).toBe('crew_startup_docker');
  });

  it('startupEventSchema rejects an unknown subtype', () => {
    expect(() =>
      startupEventSchema.parse({
        type: 'system',
        subtype: 'crew_startup_unknown',
        status: 'started',
        timestamp: '2026-05-23T10:01:00.000Z',
        summary: '',
      }),
    ).toThrow();
  });

  it('startupEventSchema rejects an unknown status', () => {
    expect(() =>
      startupEventSchema.parse({
        type: 'system',
        subtype: 'crew_startup_npm_install',
        status: 'pending',
        timestamp: '2026-05-23T10:01:00.000Z',
        summary: '',
      }),
    ).toThrow();
  });

  it('StartupPhaseSubtype covers the union exhaustively', () => {
    const subtype: StartupPhaseSubtype = 'crew_startup_claude_spawn';
    expect(STARTUP_PHASE_SUBTYPES).toContain(subtype);
  });
});

describe('StartupPhaseRow', () => {
  it('shape pin: in_flight (no completedAt)', () => {
    const row: StartupPhaseRow = {
      type: 'system',
      subtype: 'crew_startup_npm_install',
      startedAt: '2026-05-23T10:00:00.000Z',
      completedAt: null,
      status: 'in_flight',
      summary: 'npm ci begun',
      durationMs: null,
      logPath: null,
    };
    expect(row.status).toBe('in_flight');
  });

  it('shape pin: completed with all fields populated', () => {
    const row: StartupPhaseRow = {
      type: 'system',
      subtype: 'crew_startup_docker',
      startedAt: '2026-05-23T10:00:00.000Z',
      completedAt: '2026-05-23T10:01:00.000Z',
      status: 'completed',
      summary: 'All services healthy',
      durationMs: 60_000,
      logPath: '/tmp/crew-docker-A.log',
    };
    expect(row.completedAt).toBe('2026-05-23T10:01:00.000Z');
  });

  it('is assignable to TranscriptEvent', () => {
    const row: StartupPhaseRow = {
      type: 'system',
      subtype: 'crew_startup_preflight',
      startedAt: '2026-05-23T10:00:00.000Z',
      completedAt: '2026-05-23T10:00:01.000Z',
      status: 'completed',
      summary: 'ports allocated',
      durationMs: 1000,
      logPath: null,
    };
    const evt: TranscriptEvent = row;
    expect(evt.type).toBe('system');
  });
});
