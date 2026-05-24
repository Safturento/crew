import { describe, expect, it } from 'vitest';

import { STATE_CLASSES, STATE_META, sortAgentsByPriority } from './state-meta.js';
import type { Agent, AgentState } from './types.js';

const agent = (key: string, state: Agent['state'], startedAt: string): Agent => ({
  key,
  projectName: 'p',
  ticketTitle: 't',
  state,
  startedAt,
  tokens: 0,
});

describe('STATE_META', () => {
  it('marks waiting, pr_open, pr_merged, and error as attention states', () => {
    expect(STATE_META.waiting.attention).toBe(true);
    expect(STATE_META.pr_open.attention).toBe(true);
    expect(STATE_META.pr_merged.attention).toBe(true);
    expect(STATE_META.error.attention).toBe(true);
  });

  it('marks running, initializing, idle, finished as non-attention', () => {
    expect(STATE_META.running.attention).toBe(false);
    expect(STATE_META.initializing.attention).toBe(false);
    expect(STATE_META.idle.attention).toBe(false);
    expect(STATE_META.finished.attention).toBe(false);
  });

  // CREW-202: pr_merged is the "ready to finish" success state. Its label
  // and sortRank live between pr_open (the active wait) and running (the
  // wider active work) so it doesn't get buried at the bottom of the list.
  it('pr_merged is labeled "PR merged"', () => {
    expect(STATE_META.pr_merged.label).toBe('PR merged');
  });
});

describe('sortAgentsByPriority', () => {
  it('orders states: waiting > error > pr_open > pr_merged > running > initializing > idle > finished', () => {
    const agents: Agent[] = [
      agent('a', 'finished', '2026-04-26T10:00:00Z'),
      agent('b', 'idle', '2026-04-26T10:00:00Z'),
      agent('c', 'initializing', '2026-04-26T10:00:00Z'),
      agent('d', 'running', '2026-04-26T10:00:00Z'),
      agent('e', 'pr_open', '2026-04-26T10:00:00Z'),
      agent('f', 'error', '2026-04-26T10:00:00Z'),
      agent('g', 'waiting', '2026-04-26T10:00:00Z'),
      agent('h', 'pr_merged', '2026-04-26T10:00:00Z'),
    ];
    const sorted = sortAgentsByPriority(agents);
    expect(sorted.map((a) => a.key)).toEqual(['g', 'f', 'e', 'h', 'd', 'c', 'b', 'a']);
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

const ALL_STATES: AgentState[] = [
  'initializing',
  'running',
  'idle',
  'waiting',
  'pr_open',
  'pr_merged',
  'error',
  'finished',
];

describe('pr_merged class tokens (CREW-202)', () => {
  it('uses the emerald success family to signal "done, ready to finish"', () => {
    const tokens = STATE_CLASSES.pr_merged;
    expect(tokens.text).toMatch(/emerald/);
    expect(tokens.solidBg).toMatch(/emerald/);
  });
});

const TOKEN_KEYS = ['text', 'bg', 'border', 'solidBg', 'solidBorder'] as const;

describe('STATE_CLASSES', () => {
  it.each(ALL_STATES)('has non-empty class tokens for %s', (state) => {
    const tokens = STATE_CLASSES[state];
    for (const key of TOKEN_KEYS) {
      expect(tokens[key], `${state}.${key}`).toMatch(/^\S+$/);
    }
  });

  it.each(ALL_STATES)(
    'uses literal class names (no template-string interpolation) for %s',
    (state) => {
      const tokens = STATE_CLASSES[state];
      for (const key of TOKEN_KEYS) {
        expect(tokens[key], `${state}.${key}`).not.toMatch(/[$\\{}]/);
      }
    },
  );
});
