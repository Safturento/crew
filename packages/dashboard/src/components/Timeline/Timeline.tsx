import { ListCollapse } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { useStateHistory, useTimeline } from '../../data/queries.js';
import type { AgentDetailTokensByTool, AgentState, TranscriptEvent } from '../../data/types.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../ui/button.js';
import { Filters, defaultTimelineFilterState, type TimelineFilterState } from './Filters.js';
import { isToolVisible } from './filter-state.js';
import { LiveModeToggle, NewEventsPill } from './LiveModeToggle.js';
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

export function Timeline({ agentKey, agentState, tokensByTool = [] }: TimelineProps) {
  const { data: timelineData, isLoading } = useTimeline(agentKey);
  const { data: historyData } = useStateHistory(agentKey);
  const [filterState, setFilterState] = useState<TimelineFilterState>(
    () => defaultTimelineFilterState,
  );
  const [searchInput, setSearchInput] = useState('');
  const deferredSearch = useDeferredValue(searchInput);
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

  // New-events pill is driven by the *unfiltered* server-side length so
  // toggling a chip never registers as "new events arrived."
  const lastSeenServerLengthRef = useRef<number>(rawEvents.length);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  useEffect(() => {
    const prev = lastSeenServerLengthRef.current;
    const next = rawEvents.length;
    if (next > prev && !liveMode) {
      setPendingNewCount((c) => c + (next - prev));
    }
    lastSeenServerLengthRef.current = next;
  }, [rawEvents.length, liveMode]);
  useEffect(() => {
    if (liveMode) setPendingNewCount(0);
  }, [liveMode]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastSeenVisibleLengthRef = useRef<number>(filteredEvents.length);
  useEffect(() => {
    const prev = lastSeenVisibleLengthRef.current;
    const next = filteredEvents.length;
    if (liveMode && next > prev && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    lastSeenVisibleLengthRef.current = next;
  }, [filteredEvents.length, liveMode]);

  const { heights: sectionHeights, refFor: sectionRefFor } = useSectionHeights(sections.length);
  const [stripeHeight, setStripeHeight] = useState(0);

  // Observe the scroll viewport's clientHeight so the stripe matches it.
  // Depends on `isLoading` so we re-attach once the loading branch unmounts
  // and the real scroll viewport (with `scrollRef`) appears in the DOM.
  useEffect(() => {
    if (isLoading) return;
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      setStripeHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading]);

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
      const viewport = scrollRef.current;
      if (!viewport) return;
      const sectionEls = viewport.querySelectorAll<HTMLElement>('[data-testid="timeline-section"]');
      const target = sectionEls[idx];
      if (!target) return;
      const toolbar = viewport.querySelector<HTMLElement>('[data-testid="timeline-toolbar"]');
      const toolbarHeight = toolbar?.clientHeight ?? 0;
      const top = target.offsetTop - toolbarHeight;
      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({ top, behavior: 'smooth' });
      } else {
        viewport.scrollTop = top;
      }
      if (liveMode) setLiveMode(false);
    },
    [liveMode],
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
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{ scrollbarGutter: 'stable' }}
      >
        <TimelineToolbar
          data-testid="timeline-toolbar"
          className="sticky top-0 z-10 bg-card"
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
          <div className="flex flex-col gap-2 px-1 py-1">
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
                    {s.events.map((event) => (
                      <TranscriptRow key={eventKey(event)} event={event} />
                    ))}
                  </TimelineSection>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {filteredEvents.length > 0 && sections.length > 0 && (
        <MinimapStripe
          sections={minimapSections}
          stripeHeight={stripeHeight}
          onSectionJump={onSectionJump}
        />
      )}
      {!liveMode && pendingNewCount > 0 && (
        <div className="pointer-events-none absolute right-3 bottom-3">
          <span className="pointer-events-auto">
            <NewEventsPill
              count={pendingNewCount}
              onClick={() => {
                if (scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
                setPendingNewCount(0);
              }}
            />
          </span>
        </div>
      )}
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
  'data-testid': testId,
}: TimelineToolbarProps) {
  return (
    <div
      data-testid={testId}
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

function eventKey(event: TranscriptEvent): string {
  const r = event as unknown as { uuid?: string; timestamp?: string };
  return r.uuid ?? r.timestamp ?? Math.random().toString(36).slice(2);
}

function matchesFilters(
  event: TranscriptEvent,
  state: TimelineFilterState,
  toolNameById: ReadonlyMap<string, string>,
  needle: string,
): boolean {
  const cats = eventCategories(event);
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
