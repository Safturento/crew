import type { CategoryId } from './eventClassification.js';
import type { TimelineFilterState, ToolsMode } from './filter-state.js';

/** sessionStorage key namespacing the persisted filters for one agent. */
export function filterStorageKey(agentKey: string): string {
  return `crew:timeline-filters:${agentKey}`;
}

interface Serialized {
  categories: CategoryId[];
  tools: { mode: ToolsMode; set: string[] };
  search: string;
}

/**
 * Persist the drawer's filter + search state for an agent. `Set` fields are
 * serialized to arrays. Best-effort: a full or unavailable sessionStorage is
 * swallowed rather than thrown. `liveMode` and section-collapse state are
 * intentionally NOT persisted.
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
 * Read back an agent's persisted filter + search state, rehydrating arrays into
 * `Set`s. Returns null when nothing is stored, the store is unreadable, or the
 * payload is malformed/structurally invalid.
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
    if (p.tools.mode !== 'all-known' && p.tools.mode !== 'explicit') return null;
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
