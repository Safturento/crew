import { describe, it, expect, beforeEach } from 'vitest';

import { loadFilters, saveFilters, filterStorageKey } from './filter-persistence.js';
import { defaultTimelineFilterState, type TimelineFilterState } from './filter-state.js';

beforeEach(() => sessionStorage.clear());

describe('filter-persistence', () => {
  it('round-trips filter state + search through sessionStorage by agent key', () => {
    const state: TimelineFilterState = {
      categories: new Set(['tools', 'skills']),
      tools: { mode: 'explicit', set: new Set(['Bash']) },
    };
    saveFilters('CREW-1', state, 'needle');
    const loaded = loadFilters('CREW-1');
    expect(loaded).not.toBeNull();
    expect([...loaded!.state.categories].sort()).toEqual(['skills', 'tools']);
    expect(loaded!.state.tools).toEqual({ mode: 'explicit', set: new Set(['Bash']) });
    expect(loaded!.search).toBe('needle');
  });

  it('isolates by agent key', () => {
    saveFilters('CREW-1', defaultTimelineFilterState, 'a');
    expect(loadFilters('CREW-2')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    sessionStorage.setItem(filterStorageKey('CREW-3'), '{not json');
    expect(loadFilters('CREW-3')).toBeNull();
  });

  it('namespaces the storage key by agent', () => {
    expect(filterStorageKey('CREW-9')).toBe('crew:timeline-filters:CREW-9');
  });
});
