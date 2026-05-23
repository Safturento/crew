import { ListCollapse } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { useStateHistory, useTimeline } from '../../data/queries.js';
import type { AgentDetailTokensByTool, AgentState, TranscriptEvent } from '../../data/types.js';
import { toolAlias } from '../../format/tool-alias.js';
import { Button } from '../ui/button.js';
import { Filters, defaultTimelineFilterState, type TimelineFilterState } from './Filters.js';
import { LiveModeToggle, NewEventsPill } from './LiveModeToggle.js';
import { SearchBar } from './SearchBar.js';
import {
  eventCategories,
  eventOneLiner,
  eventToolNames,
  isDroppedEvent,
} from './eventClassification.js';
import { groupEventsByState, type TimelineSectionData } from './groupEventsByState.js';
import { TimelineSection } from './TimelineSection.js';
import { TranscriptRow } from './TranscriptRow.js';

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

const sectionKey = (s: TimelineSectionData): string => `${s.state}:${s.startedAt}`;

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

  const filteredEvents = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return events.filter((evt) => matchesFilters(evt, filterState, needle));
  }, [events, filterState, deferredSearch]);

  const sections = useMemo(
    () => groupEventsByState(filteredEvents, transitions, fallbackState),
    [filteredEvents, transitions, fallbackState],
  );

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const collapseAll = () => {
    setCollapsed(Object.fromEntries(sections.map((s) => [sectionKey(s), true])));
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
      <TimelineToolbar
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
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 py-1"
        >
          {sections.map((s) => {
            const key = sectionKey(s);
            const isOpen = !collapsed[key];
            const elapsedMs = (s.endedAt ?? now) - s.startedAt;
            const tokenSum = s.events.reduce((sum, e) => sum + eventTokens(e), 0);
            return (
              <TimelineSection
                key={key}
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
            );
          })}
        </div>
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
}: TimelineToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-muted-foreground">
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

  // Tools section uses inverted-checkbox semantics: an alias in
  // `excludedTools` means the user unchecked it. Event passes iff it has
  // no tool_use blocks OR every one of its aliased tool_use names is
  // still checked (not in the exclusion set).
  if (state.excludedTools.size > 0) {
    const aliases = eventToolNames(event).map(toolAlias);
    if (aliases.length > 0) {
      for (const a of aliases) {
        if (state.excludedTools.has(a)) return false;
      }
    }
  }

  if (needle.length === 0) return true;
  return eventOneLiner(event).toLowerCase().includes(needle);
}
