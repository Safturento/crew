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
  it('marks waiting, pr_open, pr_merged, error, and orphaned as attention states', () => {
    expect(STATE_META.waiting.attention).toBe(true);
    expect(STATE_META.pr_open.attention).toBe(true);
    expect(STATE_META.pr_merged.attention).toBe(true);
    expect(STATE_META.error.attention).toBe(true);
    expect(STATE_META.orphaned.attention).toBe(true);
  });

  it('marks running, initializing, queued, idle, finished as non-attention', () => {
    expect(STATE_META.running.attention).toBe(false);
    expect(STATE_META.initializing.attention).toBe(false);
    expect(STATE_META.queued.attention).toBe(false);
    expect(STATE_META.idle.attention).toBe(false);
    expect(STATE_META.finished.attention).toBe(false);
  });

  // CREW-311: the two pre-/post-run housekeeping states from the runner
  // rework (Epic CREW-306). Queued = enqueued but not yet launched;
  // orphaned = DB says running but no live process.
  it('labels the runner-rework states Queued and Orphaned', () => {
    expect(STATE_META.queued.label).toBe('Queued');
    expect(STATE_META.orphaned.label).toBe('Orphaned');
  });

  // CREW-202: pr_merged is the "ready to finish" success state. Its label
  // and sortRank live between pr_open (the active wait) and running (the
  // wider active work) so it doesn't get buried at the bottom of the list.
  it('pr_merged is labeled "PR merged"', () => {
    expect(STATE_META.pr_merged.label).toBe('PR merged');
  });
});

describe('sortAgentsByPriority', () => {
  it('orders states: waiting > error > orphaned > pr_open > pr_merged > running > initializing > queued > idle > finished', () => {
    const agents: Agent[] = [
      agent('a', 'finished', '2026-04-26T10:00:00Z'),
      agent('b', 'idle', '2026-04-26T10:00:00Z'),
      agent('c', 'initializing', '2026-04-26T10:00:00Z'),
      agent('d', 'running', '2026-04-26T10:00:00Z'),
      agent('e', 'pr_open', '2026-04-26T10:00:00Z'),
      agent('f', 'error', '2026-04-26T10:00:00Z'),
      agent('g', 'waiting', '2026-04-26T10:00:00Z'),
      agent('h', 'pr_merged', '2026-04-26T10:00:00Z'),
      agent('i', 'queued', '2026-04-26T10:00:00Z'),
      agent('j', 'orphaned', '2026-04-26T10:00:00Z'),
    ];
    const sorted = sortAgentsByPriority(agents);
    expect(sorted.map((a) => a.key)).toEqual(['g', 'f', 'j', 'e', 'h', 'd', 'c', 'i', 'b', 'a']);
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
  'queued',
  'running',
  'idle',
  'waiting',
  'pr_open',
  'pr_merged',
  'error',
  'orphaned',
  'finished',
];

describe('pr_merged class tokens (CREW-202)', () => {
  it('uses the emerald success family to signal "done, ready to finish"', () => {
    const tokens = STATE_CLASSES.pr_merged;
    expect(tokens.text).toMatch(/emerald/);
    expect(tokens.solidBg).toMatch(/emerald/);
  });
});

// CREW-311: queued shares idle's dim slate family (pre-run quiescence);
// orphaned shares waiting's amber family (attention-worthy housekeeping) —
// per the runner-rework spec's state model (§2).
describe('runner-rework class tokens (CREW-311)', () => {
  it('queued uses the slate family', () => {
    expect(STATE_CLASSES.queued.text).toMatch(/slate/);
    expect(STATE_CLASSES.queued.solidBg).toMatch(/slate/);
  });

  it('orphaned uses the amber family', () => {
    expect(STATE_CLASSES.orphaned.text).toMatch(/amber/);
    expect(STATE_CLASSES.orphaned.solidBg).toMatch(/amber/);
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
