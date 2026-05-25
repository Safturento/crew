import { CATEGORIES, type CategoryId } from './eventClassification.js';

export type ToolsMode = 'all-known' | 'explicit';

export interface TimelineFilterState {
  readonly categories: ReadonlySet<CategoryId>;
  readonly tools: { readonly mode: ToolsMode; readonly set: ReadonlySet<string> };
}

export const defaultTimelineFilterState: TimelineFilterState = {
  categories: new Set(CATEGORIES.filter((c) => c.defaultVisible).map((c) => c.id)),
  tools: { mode: 'all-known', set: new Set() },
};

export function isToolVisible(
  alias: string,
  t: TimelineFilterState['tools'],
): boolean {
  if (t.mode === 'all-known') return true;
  return t.set.has(alias);
}

const NON_TOOLS_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'tools').map((c) => c.id);

export function computeTotalLeaves(knownAliases: readonly string[]): number {
  return NON_TOOLS_CATEGORIES.length + knownAliases.length;
}

export function computeVisibleLeaves(
  state: TimelineFilterState,
  knownAliases: readonly string[],
): number {
  let visible = 0;
  for (const id of NON_TOOLS_CATEGORIES) {
    if (state.categories.has(id)) visible += 1;
  }
  if (state.categories.has('tools')) {
    for (const a of knownAliases) {
      if (isToolVisible(a, state.tools)) visible += 1;
    }
  }
  return visible;
}

export function selectAll(_state: TimelineFilterState): TimelineFilterState {
  return {
    categories: new Set(CATEGORIES.map((c) => c.id)),
    tools: { mode: 'all-known', set: new Set() },
  };
}

export function clear(_state: TimelineFilterState): TimelineFilterState {
  return {
    categories: new Set(),
    tools: { mode: 'explicit', set: new Set() },
  };
}

export function toggleCategory(
  state: TimelineFilterState,
  id: CategoryId,
): TimelineFilterState {
  const next = new Set(state.categories);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return { ...state, categories: next };
}

export function toggleTool(
  state: TimelineFilterState,
  alias: string,
  knownAliases: readonly string[],
): TimelineFilterState {
  // Disabled-child click: Tools master is OFF + user clicks a child →
  // enable Tools master AND check the child (single click does both).
  if (!state.categories.has('tools')) {
    const cats = new Set(state.categories);
    cats.add('tools');
    return {
      categories: cats,
      tools: { mode: 'explicit', set: new Set([alias]) },
    };
  }

  if (state.tools.mode === 'all-known') {
    const next = new Set(knownAliases.filter((a) => a !== alias));
    return { ...state, tools: { mode: 'explicit', set: next } };
  }

  const next = new Set(state.tools.set);
  if (next.has(alias)) next.delete(alias);
  else next.add(alias);
  return { ...state, tools: { mode: 'explicit', set: next } };
}
