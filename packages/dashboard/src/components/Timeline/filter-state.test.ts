import { describe, expect, it } from 'vitest';

import { CATEGORIES } from './eventClassification.js';
import {
  computeTotalLeaves,
  computeVisibleLeaves,
  defaultTimelineFilterState,
  isToolVisible,
  selectAll,
  clear,
  toggleCategory,
  toggleTool,
  type TimelineFilterState,
} from './filter-state.js';

const knownAliases = ['Bash', 'Edit', 'Read', 'MCP:Jira', 'MCP:Figma'];

describe('defaultTimelineFilterState', () => {
  it('selects conversation, tools, and startup; tools mode is all-known', () => {
    const s = defaultTimelineFilterState;
    expect(Array.from(s.categories)).toEqual(['conversation', 'tools', 'startup']);
    expect(s.tools.mode).toBe('all-known');
    expect(s.tools.set.size).toBe(0);
  });
});

describe('isToolVisible', () => {
  it('returns true for any alias when mode is all-known', () => {
    expect(isToolVisible('AnyNew', { mode: 'all-known', set: new Set() })).toBe(true);
  });
  it('returns true iff alias is in set when mode is explicit', () => {
    const t = { mode: 'explicit' as const, set: new Set(['Bash']) };
    expect(isToolVisible('Bash', t)).toBe(true);
    expect(isToolVisible('Edit', t)).toBe(false);
  });
});

describe('computeVisibleLeaves / computeTotalLeaves', () => {
  it('default state: 2 non-tools categories + 5 tools = 7 visible / 11 total', () => {
    expect(computeVisibleLeaves(defaultTimelineFilterState, knownAliases)).toBe(7);
    expect(computeTotalLeaves(knownAliases)).toBe(11);
  });

  it('Tools master OFF: tool aliases excluded from visible regardless of set', () => {
    const s: TimelineFilterState = {
      categories: new Set(['conversation', 'thinking', 'hooks', 'skills', 'system', 'startup']),
      tools: { mode: 'all-known', set: new Set() },
    };
    expect(computeVisibleLeaves(s, knownAliases)).toBe(6);
  });

  it('explicit mode counts only set members for tools', () => {
    const s: TimelineFilterState = {
      categories: new Set(['conversation', 'tools', 'startup']),
      tools: { mode: 'explicit', set: new Set(['Bash', 'Edit']) },
    };
    expect(computeVisibleLeaves(s, knownAliases)).toBe(4);
  });
});

describe('selectAll', () => {
  it('puts every category and tools into all-known with empty set', () => {
    const s: TimelineFilterState = {
      categories: new Set(['conversation']),
      tools: { mode: 'explicit', set: new Set(['Bash']) },
    };
    const next = selectAll(s);
    expect(next.categories.size).toBe(CATEGORIES.length);
    expect(next.tools.mode).toBe('all-known');
    expect(next.tools.set.size).toBe(0);
  });
});

describe('clear', () => {
  it('empties categories and puts tools in explicit empty set', () => {
    const next = clear(defaultTimelineFilterState);
    expect(next.categories.size).toBe(0);
    expect(next.tools.mode).toBe('explicit');
    expect(next.tools.set.size).toBe(0);
  });
});

describe('toggleCategory', () => {
  it('removes a category that is currently in the set', () => {
    const next = toggleCategory(defaultTimelineFilterState, 'conversation');
    expect(next.categories.has('conversation')).toBe(false);
  });
  it('adds a category that is currently not in the set', () => {
    const next = toggleCategory(defaultTimelineFilterState, 'thinking');
    expect(next.categories.has('thinking')).toBe(true);
  });
  it('does not mutate the input state', () => {
    const before = new Set(defaultTimelineFilterState.categories);
    toggleCategory(defaultTimelineFilterState, 'conversation');
    expect(defaultTimelineFilterState.categories).toEqual(before);
  });
});

describe('toggleTool', () => {
  it('all-known + uncheck Bash → explicit with all-known-minus-Bash', () => {
    const next = toggleTool(defaultTimelineFilterState, 'Bash', knownAliases);
    expect(next.tools.mode).toBe('explicit');
    expect(next.tools.set.has('Bash')).toBe(false);
    expect(next.tools.set.has('Edit')).toBe(true);
    expect(next.tools.set.size).toBe(4);
  });

  it('explicit + check missing alias → adds to set', () => {
    const s: TimelineFilterState = {
      categories: new Set(['tools']),
      tools: { mode: 'explicit', set: new Set(['Bash']) },
    };
    const next = toggleTool(s, 'Edit', knownAliases);
    expect(next.tools.set.has('Edit')).toBe(true);
  });

  it('explicit + uncheck present alias → removes from set', () => {
    const s: TimelineFilterState = {
      categories: new Set(['tools']),
      tools: { mode: 'explicit', set: new Set(['Bash', 'Edit']) },
    };
    const next = toggleTool(s, 'Bash', knownAliases);
    expect(next.tools.set.has('Bash')).toBe(false);
    expect(next.tools.set.size).toBe(1);
  });

  it('Tools master OFF + click a child → enables master AND checks child', () => {
    const s: TimelineFilterState = {
      categories: new Set(['conversation']),
      tools: { mode: 'explicit', set: new Set() },
    };
    const next = toggleTool(s, 'MCP:Jira', knownAliases);
    expect(next.categories.has('tools')).toBe(true);
    expect(next.tools.mode).toBe('explicit');
    expect(next.tools.set.has('MCP:Jira')).toBe(true);
  });
});
