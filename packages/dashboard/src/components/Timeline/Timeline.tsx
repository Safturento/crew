import { ListCollapse } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';

import { useStateHistory, useTimeline } from '../../data/queries.js';
import type { AgentDetailTokensByTool, AgentState, TranscriptEvent } from '../../data/types.js';
import { cn } from '../../lib/utils.js';
import { CONDENSED_HEADER_PX } from '../CondensedHeader.js';
import { Button } from '../ui/button.js';
import { Filters, defaultTimelineFilterState, type TimelineFilterState } from './Filters.js';
import { loadFilters, saveFilters } from './filter-persistence.js';
import { isToolVisible } from './filter-state.js';
import { LiveModeToggle } from './LiveModeToggle.js';
import { MinimapStripe } from './MinimapStripe.js';
import { SearchBar } from './SearchBar.js';
import {
  buildToolNameMap,
  eventCategories,
  eventOneLiner,
  eventToolAliases,
  isDroppedEvent,
} from './eventClassification.js';
import { groupEventsByState, type TimelineSectionData } from './groupEventsByState.js';
import { TimelineSection } from './TimelineSection.js';
import { TranscriptRow } from './TranscriptRow.js';
import { useSectionHeights } from './useSectionHeights.js';

/** Enforced height of the pinned toolbar row (`h-12`). */
export const TOOLBAR_PX = 48;
/** Total pinned chrome above the scrolling timeline content. */
export const PINNED_CHROME_PX = CONDENSED_HEADER_PX + TOOLBAR_PX;

interface TimelineProps {
  agentKey: string;
  /**
   * Used to derive the live-mode default (ON for active agents, OFF for
   * `finished` / `error`) and as the fallback state for `groupEventsByState`
   * when the daemon hasn't reported any transitions yet. Optional so the
   * component can be rendered standalone in tests.
   */
  agentState?: AgentState;
  /**
   * Per-tool token aggregate from `AgentDetail.tokens_by_tool`. Drives the
   * Filters popover's "Tools" rows (alias-aggregated, descending). Default
   * empty so the component renders standalone in tests.
   */
  tokensByTool?: AgentDetailTokensByTool[];
  /**
   * The drawer-body scroll container (owned by AgentBody). Drives live-mode
   * autoscroll, minimap section-jump, and minimap viewport sizing. Optional so
   * the component can be rendered standalone in tests.
   */
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

const isLiveByDefault = (state?: AgentState): boolean => state !== 'finished' && state !== 'error';

// Index-prefixed so the leading initial-state section can't collide with the
// post-transition section when both share state + startedAt (zero-width case).
const sectionKey = (s: TimelineSectionData, i: number): string => `${i}:${s.state}:${s.startedAt}`;

function eventTokens(e: TranscriptEvent): number {
  if (e.type !== 'assistant') return 0;
  const u = e.message.usage;
  if (!u) return 0;
  return (
    (u.input_tokens ?? 0) +
    (u.output_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0)
  );
}

export function Timeline({
  agentKey,
  agentState,
  tokensByTool = [],
  scrollContainerRef,
}: TimelineProps) {
  const { data: timelineData, isLoading } = useTimeline(agentKey);
  const { data: historyData } = useStateHistory(agentKey);
  // Seed filter + search from any per-agent state persisted in a prior drawer
  // session; `liveMode` and section-collapse are intentionally not persisted.
  const [filterState, setFilterState] = useState<TimelineFilterState>(
    () => loadFilters(agentKey)?.state ?? defaultTimelineFilterState,
  );
  const [searchInput, setSearchInput] = useState(() => loadFilters(agentKey)?.search ?? '');

  // The drawer is rendered without a React key (App.tsx), so switching agents
  // reuses this component instance — the agentKey prop changes but state is not
  // reset on its own. Re-seed from the new agent's persisted filters during
  // render so we never show (or persist under the new key) the prior agent's
  // state. See react.dev "resetting state when a prop changes".
  const [seededFor, setSeededFor] = useState(agentKey);
  if (seededFor !== agentKey) {
    setSeededFor(agentKey);
    const next = loadFilters(agentKey);
    setFilterState(next?.state ?? defaultTimelineFilterState);
    setSearchInput(next?.search ?? '');
  }

  const deferredSearch = useDeferredValue(searchInput);

  // Write through on every change so the next time this agent's drawer opens
  // (or the page reloads) the filters come back.
  useEffect(() => {
    saveFilters(agentKey, filterState, searchInput);
  }, [agentKey, filterState, searchInput]);
  const [liveMode, setLiveMode] = useState<boolean>(() => isLiveByDefault(agentState));

  const rawEvents = timelineData?.events ?? [];
  const events = useMemo(() => rawEvents.filter((e) => !isDroppedEvent(e)), [rawEvents]);
  const transitions = historyData?.transitions ?? [];
  const fallbackState: AgentState = agentState ?? 'running';

  // Resolve `user.tool_result` blocks back to their tool name via the
  // `tool_use_id` map. Rebuild only when the events array changes — cheap
  // because we walk assistant.tool_use blocks once per change.
  const toolNameById = useMemo(() => buildToolNameMap(events), [events]);

  const filteredEvents = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return events.filter((evt) => matchesFilters(evt, filterState, toolNameById, needle));
  }, [events, filterState, toolNameById, deferredSearch]);

  const sections = useMemo(
    () => groupEventsByState(filteredEvents, transitions, fallbackState),
    [filteredEvents, transitions, fallbackState],
  );

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const collapseAll = () => {
    setCollapsed(Object.fromEntries(sections.map((s, i) => [sectionKey(s, i), true])));
  };
  const toggleSection = (key: string) => {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  };

  const hasActiveSection = sections.some((s) => s.endedAt === null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasActiveSection) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [hasActiveSection]);

  const lastSeenVisibleLengthRef = useRef<number>(filteredEvents.length);
  useEffect(() => {
    const prev = lastSeenVisibleLengthRef.current;
    const next = filteredEvents.length;
    const el = scrollContainerRef?.current;
    if (liveMode && next > prev && el) {
      el.scrollTop = el.scrollHeight;
    }
    lastSeenVisibleLengthRef.current = next;
  }, [filteredEvents.length, liveMode, scrollContainerRef]);

  const { heights: sectionHeights, refFor: sectionRefFor } = useSectionHeights(sections.length);
  const [stripeHeight, setStripeHeight] = useState(0);

  // Observe the drawer-body scroll container's height so the stripe matches
  // the visible viewport below the pinned chrome. Depends on `isLoading` so we
  // re-attach once the loading branch unmounts and the timeline content mounts.
  useEffect(() => {
    if (isLoading) return;
    const el = scrollContainerRef?.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      setStripeHeight(Math.max(0, entry.contentRect.height - PINNED_CHROME_PX));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading, scrollContainerRef]);

  const minimapSections = useMemo(
    () =>
      sections.map((s, i) => ({
        state: s.state,
        startedAt: s.startedAt,
        eventCount: s.events.length,
        height: sectionHeights[i] ?? 0,
      })),
    [sections, sectionHeights],
  );

  const onSectionJump = useCallback(
    (idx: number) => {
      // Jumping is manual navigation — break live-follow even if the
      // scroll container isn't wired (standalone test renders).
      if (liveMode) setLiveMode(false);
      const viewport = scrollContainerRef?.current;
      if (!viewport) return;
      const sectionEls = viewport.querySelectorAll<HTMLElement>('[data-testid="timeline-section"]');
      const target = sectionEls[idx];
      if (!target) return;
      // Position relative to the scroll container, minus the pinned chrome so
      // the section header lands just below the sticky toolbar.
      const top =
        target.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        viewport.scrollTop -
        PINNED_CHROME_PX;
      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({ top, behavior: 'smooth' });
      } else {
        viewport.scrollTop = top;
      }
    },
    [liveMode, scrollContainerRef],
  );

  if (isLoading) {
    return (
      <div
        data-testid="timeline-loading"
        className="flex items-center justify-center p-6 text-sm text-muted-foreground"
      >
        Loading timeline…
      </div>
    );
  }

  const resetFilters = () => {
    setFilterState(defaultTimelineFilterState);
    setSearchInput('');
  };

  return (
    <div className="relative flex min-h-0 flex-col">
      <TimelineToolbar
        data-testid="timeline-toolbar"
        className="sticky z-10 h-12 bg-card"
        style={{ top: CONDENSED_HEADER_PX }}
        filterState={filterState}
        onFilterStateChange={setFilterState}
        tokensByTool={tokensByTool}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        liveMode={liveMode}
        onLiveModeChange={setLiveMode}
        onCollapseAll={collapseAll}
        canCollapseAll={sections.length > 0}
      />
      <div className="relative">
        {filteredEvents.length > 0 && sections.length > 0 && (
          /* Zero-height sticky anchor that pins the minimap stripe just below
             the pinned chrome while the timeline content scrolls past. */
          <div className="sticky z-10 h-0" style={{ top: PINNED_CHROME_PX }}>
            <div className="relative" style={{ height: stripeHeight }}>
              <MinimapStripe
                sections={minimapSections}
                stripeHeight={stripeHeight}
                onSectionJump={onSectionJump}
              />
            </div>
          </div>
        )}
        {events.length === 0 ? (
          <div
            data-testid="timeline-empty"
            className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground"
          >
            No timeline events yet.
          </div>
        ) : filteredEvents.length === 0 ? (
          <FilterEmptyState onShowAll={resetFilters} />
        ) : (
          // pr-6 reserves a gutter so content clears the MinimapStripe
          // (right: SCROLLBAR_GUTTER 14px + width STRIPE_WIDTH 8px).
          <div className="flex flex-col gap-2 py-1 pl-1 pr-6">
            {sections.map((s, i) => {
              const key = sectionKey(s, i);
              const isOpen = !collapsed[key];
              const elapsedMs = (s.endedAt ?? now) - s.startedAt;
              const tokenSum = s.events.reduce((sum, e) => sum + eventTokens(e), 0);
              return (
                <div key={key} ref={sectionRefFor(i)}>
                  <TimelineSection
                    state={s.state}
                    startedAt={s.startedAt}
                    elapsedMs={elapsedMs}
                    eventCount={s.events.length}
                    tokenSum={tokenSum}
                    isOpen={isOpen}
                    onToggle={() => toggleSection(key)}
                  >
                    {s.events.map((event, evIdx) => (
                      <TranscriptRow
                        key={eventKey(event, evIdx)}
                        event={event}
                        toolNameById={toolNameById}
                      />
                    ))}
                  </TimelineSection>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface FilterEmptyStateProps {
  onShowAll: () => void;
}

function FilterEmptyState({ onShowAll }: FilterEmptyStateProps) {
  return (
    <div
      data-testid="timeline-filter-empty"
      className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
    >
      <p>No events match your filters.</p>
      <button
        type="button"
        onClick={onShowAll}
        className="font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Show all
      </button>
    </div>
  );
}

interface TimelineToolbarProps {
  filterState: TimelineFilterState;
  onFilterStateChange: (next: TimelineFilterState) => void;
  tokensByTool: AgentDetailTokensByTool[];
  searchValue: string;
  onSearchChange: (next: string) => void;
  liveMode: boolean;
  onLiveModeChange: (next: boolean) => void;
  onCollapseAll: () => void;
  canCollapseAll: boolean;
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
}

function TimelineToolbar({
  filterState,
  onFilterStateChange,
  tokensByTool,
  searchValue,
  onSearchChange,
  liveMode,
  onLiveModeChange,
  onCollapseAll,
  canCollapseAll,
  className,
  style,
  'data-testid': testId,
}: TimelineToolbarProps) {
  return (
    <div
      data-testid={testId}
      style={style}
      className={cn(
        'flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-muted-foreground',
        className,
      )}
    >
      <Filters state={filterState} onChange={onFilterStateChange} tokensByTool={tokensByTool} />
      <SearchBar value={searchValue} onChange={onSearchChange} />
      <Button
        color="idle"
        intensity="mid"
        size="sm"
        icon={<ListCollapse aria-hidden />}
        onClick={onCollapseAll}
        disabled={!canCollapseAll}
      >
        Collapse all
      </Button>
      <LiveModeToggle active={liveMode} onChange={onLiveModeChange} />
    </div>
  );
}

export function eventKey(event: TranscriptEvent, index: number): string {
  const r = event as unknown as {
    uuid?: string;
    timestamp?: string;
    startedAt?: string;
    type?: string;
  };
  return r.uuid ?? r.timestamp ?? r.startedAt ?? `${r.type ?? 'event'}:${index}`;
}

function matchesFilters(
  event: TranscriptEvent,
  state: TimelineFilterState,
  toolNameById: ReadonlyMap<string, string>,
  needle: string,
): boolean {
  const cats = eventCategories(event, toolNameById);
  let categoryMatch = false;
  for (const c of cats) {
    if (state.categories.has(c)) {
      categoryMatch = true;
      break;
    }
  }
  if (!categoryMatch) return false;

  if (state.categories.has('tools')) {
    const aliases = eventToolAliases(event, toolNameById);
    if (aliases.length > 0) {
      let anyVisible = false;
      for (const a of aliases) {
        if (isToolVisible(a, state.tools)) {
          anyVisible = true;
          break;
        }
      }
      if (!anyVisible) return false;
    }
  }

  if (needle.length === 0) return true;
  return eventOneLiner(event).toLowerCase().includes(needle);
}
