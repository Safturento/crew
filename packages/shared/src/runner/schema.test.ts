import { describe, expect, it } from 'vitest';
import {
  enqueueRunnerCommandSchema,
  liveProcessSchema,
  runnerSnapshotSchema,
} from './schema.js';

describe('liveProcessSchema', () => {
  const valid = {
    agentKey: 'CREW-231',
    command: 'run' as const,
    pid: 1234,
    pgid: 1234,
    actionRequestId: 7,
    spawnedAt: '2026-06-16T00:00:00.000Z',
    state: 'running' as const,
    project: 'crew',
  };

  it('accepts a well-formed live process', () => {
    expect(liveProcessSchema.parse(valid)).toEqual(valid);
  });

  it('accepts a null actionRequestId (process not from the queue)', () => {
    expect(liveProcessSchema.parse({ ...valid, actionRequestId: null }).actionRequestId).toBe(null);
  });

  it('rejects an unknown command verb', () => {
    expect(() => liveProcessSchema.parse({ ...valid, command: 'deploy' })).toThrow();
  });

  it('rejects an unknown live state', () => {
    expect(() => liveProcessSchema.parse({ ...valid, state: 'zombie' })).toThrow();
  });
});

describe('runnerSnapshotSchema', () => {
  it('accepts an empty process list', () => {
    expect(runnerSnapshotSchema.parse({ processes: [] })).toEqual({ processes: [] });
  });

  it('rejects a missing processes array', () => {
    expect(() => runnerSnapshotSchema.parse({})).toThrow();
  });
});

describe('enqueueRunnerCommandSchema', () => {
  it('accepts a cancel command targeting an agent', () => {
    expect(
      enqueueRunnerCommandSchema.parse({ agentKey: 'CREW-231', kind: 'cancel_soft', payload: null }),
    ).toEqual({ agentKey: 'CREW-231', kind: 'cancel_soft', payload: null });
  });

  it('accepts a null agentKey for a queue-level command', () => {
    expect(
      enqueueRunnerCommandSchema.parse({ agentKey: null, kind: 'dequeue', payload: null }).agentKey,
    ).toBe(null);
  });

  it('defaults payload to null when omitted', () => {
    expect(
      enqueueRunnerCommandSchema.parse({ agentKey: 'CREW-231', kind: 'cancel_hard' }).payload,
    ).toBe(null);
  });

  it('carries a steering message payload', () => {
    const parsed = enqueueRunnerCommandSchema.parse({
      agentKey: 'CREW-231',
      kind: 'message',
      payload: { message: 'wrap it up' },
    });
    expect(parsed.payload).toEqual({ message: 'wrap it up' });
  });

  it('rejects an unknown command kind', () => {
    expect(() => enqueueRunnerCommandSchema.parse({ agentKey: 'CREW-231', kind: 'nuke' })).toThrow();
  });
});
