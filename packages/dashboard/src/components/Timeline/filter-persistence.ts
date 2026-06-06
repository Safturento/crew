import type { CategoryId } from './eventClassification.js';
import type { TimelineFilterState, ToolsMode } from './filter-state.js';

/** sessionStorage key for one agent's persisted timeline filters. */
export function filterStorageKey(agentKey: string): string {
  return `crew:timeline-filters:${agentKey}`;
}

interface Serialized {
  categories: CategoryId[];
  tools: { mode: ToolsMode; set: string[] };
  search: string;
}

/**
 * Persist the timeline filter state + search box for one agent. Set fields are
 * serialized to arrays. Best-effort: a full/unavailable sessionStorage is
 * swallowed silently. `liveMode` and section-collapse state are intentionally
 * not persisted.
 */
export function saveFilters(agentKey: string, state: TimelineFilterState, search: string): void {
  const payload: Serialized = {
    categories: [...state.categories],
    tools: { mode: state.tools.mode, set: [...state.tools.set] },
    search,
  };
  try {
    sessionStorage.setItem(filterStorageKey(agentKey), JSON.stringify(payload));
  } catch {
    // sessionStorage unavailable/full — persistence is best-effort.
  }
}

/**
 * Read back a previously persisted filter state for an agent. Returns null when
 * nothing is stored, storage is unavailable, or the stored payload is malformed.
 */
export function loadFilters(
  agentKey: string,
): { state: TimelineFilterState; search: string } | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(filterStorageKey(agentKey));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Serialized;
    if (!Array.isArray(p.categories) || !p.tools || !Array.isArray(p.tools.set)) return null;
    return {
      state: {
        categories: new Set(p.categories),
        tools: { mode: p.tools.mode, set: new Set(p.tools.set) },
      },
      search: typeof p.search === 'string' ? p.search : '',
    };
  } catch {
    return null;
  }
}
