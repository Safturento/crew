import { describe, it, expect } from 'vitest';
import type { LiveProcess } from 'crew-shared';
import { Registry } from './registry.js';

function proc(over: Partial<LiveProcess> = {}): LiveProcess {
  return {
    agentKey: 'CREW-231',
    command: 'run',
    pid: 10,
    pgid: 10,
    actionRequestId: 1,
    spawnedAt: '2026-06-16T00:00:00.000Z',
    state: 'running',
    project: 'crew',
    ...over,
  };
}

describe('Registry', () => {
  it('tracks a spawned process and serializes it in the snapshot', () => {
    const r = new Registry();
    r.add(proc());
    expect(r.toSnapshot().processes).toHaveLength(1);
    expect(r.toSnapshot().processes[0].agentKey).toBe('CREW-231');
  });

  it('drops a removed process from the snapshot', () => {
    const r = new Registry();
    r.add(proc());
    r.remove('CREW-231');
    expect(r.toSnapshot().processes).toHaveLength(0);
  });

  it('returns the tracked entry via get, undefined when absent', () => {
    const r = new Registry();
    r.add(proc({ pid: 42 }));
    expect(r.get('CREW-231')?.pid).toBe(42);
    expect(r.get('CREW-999')).toBeUndefined();
  });

  it('transitions a tracked entry state and leaves the rest intact', () => {
    const r = new Registry();
    r.add(proc({ pgid: 77 }));
    r.setState('CREW-231', 'cancelling');
    const entry = r.get('CREW-231');
    expect(entry?.state).toBe('cancelling');
    expect(entry?.pgid).toBe(77);
  });

  it('setState on an unknown key is a no-op (no phantom entry created)', () => {
    const r = new Registry();
    r.setState('CREW-ghost', 'cancelling');
    expect(r.toSnapshot().processes).toHaveLength(0);
  });

  it('add with an existing key replaces the entry (rather than duplicating)', () => {
    const r = new Registry();
    r.add(proc({ pid: 1 }));
    r.add(proc({ pid: 2 }));
    expect(r.toSnapshot().processes).toHaveLength(1);
    expect(r.get('CREW-231')?.pid).toBe(2);
  });
});
