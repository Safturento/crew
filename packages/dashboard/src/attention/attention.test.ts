import { describe, expect, it } from 'vitest';

import type { Agent } from '../data/types.js';
import { attentionKeys } from './attention.js';

const agent = (key: string, state: Agent['state']): Agent => ({
  key,
  projectName: 'p',
  ticketTitle: 't',
  state,
  startedAt: '2026-04-26T10:00:00Z',
  tokens: 0,
});

describe('attentionKeys', () => {
  it('returns keys of agents in waiting / pr_open / error states', () => {
    const agents = [
      agent('a', 'running'),
      agent('b', 'waiting'),
      agent('c', 'pr_open'),
      agent('d', 'error'),
      agent('e', 'finished'),
    ];
    expect(attentionKeys(agents)).toEqual(new Set(['b', 'c', 'd']));
  });

  it('returns an empty set when no agents are in attention states', () => {
    expect(attentionKeys([agent('a', 'running'), agent('b', 'idle')])).toEqual(new Set());
  });
});
