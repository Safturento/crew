import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { useTimeline } from '../../data/queries.js';
import type { AgentState, TranscriptEvent } from '../../data/types.js';
import { EventCard } from './EventCard.js';
import { FilterChips } from './FilterChips.js';
import { LiveModeToggle, NewEventsPill } from './LiveModeToggle.js';
import { SearchBar } from './SearchBar.js';
import {
  defaultVisibleSet,
  eventChipGroups,
  eventOneLiner,
  type ChipGroup,
} from './eventClassification.js';

interface TimelineProps {
  agentKey: string;
  /**
   * Used to derive the live-mode default. ON for active agents,
   * OFF for `finished` / `error`. Optional so the component can be
   * rendered standalone (e.g. in tests).
   */
  agentState?: AgentState;
}

const ESTIMATED_ROW_HEIGHT = 88;

const isLiveByDefault = (state?: AgentState): boolean => state !== 'finished' && state !== 'error';

export function Timeline({ agentKey, agentState }: TimelineProps) {
  const { data, isLoading } = useTimeline(agentKey);
  const [visibleGroups, setVisibleGroups] = useState<ReadonlySet<ChipGroup>>(
    () => new Set(defaultVisibleSet),
  );
  const [searchInput, setSearchInput] = useState('');
  const deferredSearch = useDeferredValue(searchInput);
  const [liveMode, setLiveMode] = useState<boolean>(() => isLiveByDefault(agentState));

  const events = data?.events ?? [];
  const filteredEvents = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return events.filter((evt) => {
      if (!intersects(eventChipGroups(evt), visibleGroups)) return false;
      if (needle.length === 0) return true;
      return eventOneLiner(evt).toLowerCase().includes(needle);
    });
  }, [events, visibleGroups, deferredSearch]);

  // New-events pill is driven by the *unfiltered* length so toggling a
  // chip never registers as "new events arrived from the server."
  const lastSeenServerLengthRef = useRef<number>(events.length);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  useEffect(() => {
    const prev = lastSeenServerLengthRef.current;
    const next = events.length;
    if (next > prev && !liveMode) {
      setPendingNewCount((c) => c + (next - prev));
    }
    lastSeenServerLengthRef.current = next;
  }, [events.length, liveMode]);
  useEffect(() => {
    if (liveMode) setPendingNewCount(0);
  }, [liveMode]);

  if (isLoading) {
    return (
      <div
        data-testid="timeline-loading"
        className="flex items-center justify-center p-6 text-sm text-text-2"
      >
        Loading timeline…
      </div>
    );
  }

  const resetFilters = () => {
    setVisibleGroups(new Set(defaultVisibleSet));
    setSearchInput('');
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <TimelineToolbar
        visibleGroups={visibleGroups}
        onVisibleGroupsChange={setVisibleGroups}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        liveMode={liveMode}
        onLiveModeChange={setLiveMode}
      />
      {events.length === 0 ? (
        <div
          data-testid="timeline-empty"
          className="flex flex-1 items-center justify-center p-6 text-sm text-text-3"
        >
          No timeline events yet.
        </div>
      ) : filteredEvents.length === 0 ? (
        <FilterEmptyState onShowAll={resetFilters} />
      ) : (
        <VirtualEventList
          events={filteredEvents}
          liveMode={liveMode}
          pendingNewCount={pendingNewCount}
          onClearPendingNew={() => setPendingNewCount(0)}
        />
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
      className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm text-text-3"
    >
      <p>No events match your filters.</p>
      <button
        type="button"
        onClick={onShowAll}
        className="font-mono text-[11px] text-text-2 underline-offset-2 hover:underline"
      >
        Show all
      </button>
    </div>
  );
}

interface TimelineToolbarProps {
  visibleGroups: ReadonlySet<ChipGroup>;
  onVisibleGroupsChange: (next: Set<ChipGroup>) => void;
  searchValue: string;
  onSearchChange: (next: string) => void;
  liveMode: boolean;
  onLiveModeChange: (next: boolean) => void;
}

function TimelineToolbar({
  visibleGroups,
  onVisibleGroupsChange,
  searchValue,
  onSearchChange,
  liveMode,
  onLiveModeChange,
}: TimelineToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-text-3">
      <FilterChips visible={visibleGroups} onChange={onVisibleGroupsChange} />
      <SearchBar value={searchValue} onChange={onSearchChange} />
      <LiveModeToggle active={liveMode} onChange={onLiveModeChange} />
    </div>
  );
}

interface VirtualEventListProps {
  events: TranscriptEvent[];
  liveMode: boolean;
  pendingNewCount: number;
  onClearPendingNew: () => void;
}

function VirtualEventList({
  events,
  liveMode,
  pendingNewCount,
  onClearPendingNew,
}: VirtualEventListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const lastSeenVisibleLengthRef = useRef<number>(events.length);

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 6,
  });

  // Auto-scroll to the latest visible row when live mode is ON and
  // the visible count grew. Tracks the visible length (not server
  // length) so the scroll target is always a real row.
  useEffect(() => {
    const prev = lastSeenVisibleLengthRef.current;
    const next = events.length;
    if (liveMode && next > prev && next > 0) {
      virtualizer.scrollToIndex(next - 1, { align: 'end' });
    }
    lastSeenVisibleLengthRef.current = next;
  }, [events.length, liveMode, virtualizer]);

  const items = virtualizer.getVirtualItems();

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={parentRef} className="h-full overflow-y-auto">
        <div style={{ height: `${virtualizer.getTotalSize()}px` }} className="relative w-full">
          {items.map((vi) => {
            const event = events[vi.index];
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <EventCard event={event} />
              </div>
            );
          })}
        </div>
      </div>
      {!liveMode && pendingNewCount > 0 && (
        <div className="pointer-events-none absolute right-3 bottom-3">
          <span className="pointer-events-auto">
            <NewEventsPill
              count={pendingNewCount}
              onClick={() => {
                if (events.length > 0) {
                  virtualizer.scrollToIndex(events.length - 1, { align: 'end' });
                }
                onClearPendingNew();
              }}
            />
          </span>
        </div>
      )}
    </div>
  );
}

function intersects<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}
