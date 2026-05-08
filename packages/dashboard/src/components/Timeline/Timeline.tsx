import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { useTimeline } from '../../data/queries.js';
import type { TranscriptEvent } from '../../data/types.js';
import { EventCard } from './EventCard.js';
import { FilterChips } from './FilterChips.js';
import { defaultVisibleSet, eventChipGroups, type ChipGroup } from './eventClassification.js';

interface TimelineProps {
  agentKey: string;
}

const ESTIMATED_ROW_HEIGHT = 88;

export function Timeline({ agentKey }: TimelineProps) {
  const { data, isLoading } = useTimeline(agentKey);
  const [visibleGroups, setVisibleGroups] = useState<ReadonlySet<ChipGroup>>(
    () => new Set(defaultVisibleSet),
  );

  const events = data?.events ?? [];
  const filteredEvents = useMemo(
    () => events.filter((evt) => intersects(eventChipGroups(evt), visibleGroups)),
    [events, visibleGroups],
  );

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TimelineToolbar visibleGroups={visibleGroups} onChange={setVisibleGroups} />
      {events.length === 0 ? (
        <div
          data-testid="timeline-empty"
          className="flex flex-1 items-center justify-center p-6 text-sm text-text-3"
        >
          No timeline events yet.
        </div>
      ) : (
        <VirtualEventList events={filteredEvents} />
      )}
    </div>
  );
}

interface TimelineToolbarProps {
  visibleGroups: ReadonlySet<ChipGroup>;
  onChange: (next: Set<ChipGroup>) => void;
}

function TimelineToolbar({ visibleGroups, onChange }: TimelineToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-text-3">
      <FilterChips visible={visibleGroups} onChange={onChange} />
      <SearchBarSlot />
      <span className="flex-1" />
      <LiveModeToggleSlot />
    </div>
  );
}

function SearchBarSlot() {
  return <span data-testid="search-bar-slot" className="italic" />;
}

function LiveModeToggleSlot() {
  return <span data-testid="live-mode-toggle-slot" className="italic" />;
}

interface VirtualEventListProps {
  events: TranscriptEvent[];
}

function VirtualEventList({ events }: VirtualEventListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 6,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
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
  );
}

function intersects<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}
