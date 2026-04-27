import { describe, expect, it } from 'vitest';

import { STATE_META, sortAgentsByPriority } from './state-meta.js';
import type { Agent } from './types.js';

const agent = (key: string, state: Agent['state'], startedAt: string): Agent => ({
  key,
  projectName: 'p',
  ticketTitle: 't',
  state,
  startedAt,
  tokens: 0,
});

describe('STATE_META', () => {
  it('marks waiting, pr_open, and error as attention states', () => {
    expect(STATE_META.waiting.attention).toBe(true);
    expect(STATE_META.pr_open.attention).toBe(true);
    expect(STATE_META.error.attention).toBe(true);
  });

  it('marks running, initializing, idle, finished as non-attention', () => {
    expect(STATE_META.running.attention).toBe(false);
    expect(STATE_META.initializing.attention).toBe(false);
    expect(STATE_META.idle.attention).toBe(false);
    expect(STATE_META.finished.attention).toBe(false);
  });
});

describe('sortAgentsByPriority', () => {
  it('orders states: waiting > error > pr_open > running > initializing > idle > finished', () => {
    const agents: Agent[] = [
      agent('a', 'finished', '2026-04-26T10:00:00Z'),
      agent('b', 'idle', '2026-04-26T10:00:00Z'),
      agent('c', 'initializing', '2026-04-26T10:00:00Z'),
      agent('d', 'running', '2026-04-26T10:00:00Z'),
      agent('e', 'pr_open', '2026-04-26T10:00:00Z'),
      agent('f', 'error', '2026-04-26T10:00:00Z'),
      agent('g', 'waiting', '2026-04-26T10:00:00Z'),
    ];
    const sorted = sortAgentsByPriority(agents);
    expect(sorted.map((a) => a.key)).toEqual(['g', 'f', 'e', 'd', 'c', 'b', 'a']);
  });

  it('within the same state, orders by startedAt descending', () => {
    const agents: Agent[] = [
      agent('older', 'running', '2026-04-26T10:00:00Z'),
      agent('newer', 'running', '2026-04-26T11:00:00Z'),
      agent('middle', 'running', '2026-04-26T10:30:00Z'),
    ];
    const sorted = sortAgentsByPriority(agents);
    expect(sorted.map((a) => a.key)).toEqual(['newer', 'middle', 'older']);
  });
});
