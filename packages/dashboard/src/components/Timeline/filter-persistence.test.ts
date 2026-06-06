import { beforeEach, describe, expect, it } from 'vitest';

import { filterStorageKey, loadFilters, saveFilters } from './filter-persistence.js';
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
    expect(loaded!.state.tools.mode).toBe('explicit');
    expect([...loaded!.state.tools.set]).toEqual(['Bash']);
    expect(loaded!.search).toBe('needle');
  });

  it('isolates persisted filters by agent key', () => {
    saveFilters('CREW-1', defaultTimelineFilterState, 'a');
    expect(loadFilters('CREW-2')).toBeNull();
  });

  it('keys storage as crew:timeline-filters:<agentKey>', () => {
    expect(filterStorageKey('CREW-9')).toBe('crew:timeline-filters:CREW-9');
  });

  it('returns null on malformed JSON', () => {
    sessionStorage.setItem(filterStorageKey('CREW-3'), '{not json');
    expect(loadFilters('CREW-3')).toBeNull();
  });

  it('returns null when nothing is stored for the key', () => {
    expect(loadFilters('CREW-unknown')).toBeNull();
  });

  it('returns null on structurally-invalid persisted payloads', () => {
    sessionStorage.setItem(filterStorageKey('CREW-4'), JSON.stringify({ categories: 'nope' }));
    expect(loadFilters('CREW-4')).toBeNull();
  });
});
