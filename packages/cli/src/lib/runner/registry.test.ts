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

  describe('reapDead', () => {
    it('drops a tracked entry whose pid is dead from the next snapshot', () => {
      const r = new Registry();
      r.add(proc({ agentKey: 'CREW-1', pid: 100 }));
      r.reapDead(() => false);
      expect(r.toSnapshot().processes).toHaveLength(0);
      expect(r.get('CREW-1')).toBeUndefined();
    });

    it('retains a tracked entry whose pid is still alive', () => {
      const r = new Registry();
      r.add(proc({ agentKey: 'CREW-1', pid: 100 }));
      r.reapDead(() => true);
      expect(r.toSnapshot().processes).toHaveLength(1);
      expect(r.get('CREW-1')?.pid).toBe(100);
    });

    it('reaps only the dead entries and probes by pid', () => {
      const r = new Registry();
      r.add(proc({ agentKey: 'CREW-dead', pid: 100 }));
      r.add(proc({ agentKey: 'CREW-live', pid: 200 }));
      const reaped = r.reapDead((pid) => pid === 200);
      expect(reaped).toEqual(['CREW-dead']);
      expect(r.toSnapshot().processes.map((p) => p.agentKey)).toEqual(['CREW-live']);
    });

    it('returns an empty list when nothing is dead', () => {
      const r = new Registry();
      r.add(proc({ agentKey: 'CREW-1', pid: 100 }));
      expect(r.reapDead(() => true)).toEqual([]);
    });

    it('never reaps a paused entry, even with a dead pid (resumable handle)', () => {
      // A paused `crew run` process exits (process.exit on the pause path), so
      // its pid is legitimately dead — but the entry is deliberately kept so the
      // operator can later resume it. Reaping it would destroy that.
      const r = new Registry();
      r.add(proc({ agentKey: 'CREW-paused', pid: 100, state: 'paused' }));
      const reaped = r.reapDead(() => false);
      expect(reaped).toEqual([]);
      expect(r.get('CREW-paused')?.state).toBe('paused');
    });

    it('still reaps a dead cancelling entry (only paused is exempt)', () => {
      const r = new Registry();
      r.add(proc({ agentKey: 'CREW-cancelling', pid: 100, state: 'cancelling' }));
      expect(r.reapDead(() => false)).toEqual(['CREW-cancelling']);
      expect(r.get('CREW-cancelling')).toBeUndefined();
    });
  });
});
