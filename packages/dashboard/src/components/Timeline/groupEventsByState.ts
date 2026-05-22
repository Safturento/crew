import type { AgentState, StateTransition, TranscriptEvent } from '../../data/types.js';
import { transitionToAgentState } from '../../data/state-meta.js';

export interface TimelineSectionData {
  state: AgentState;
  startedAt: number;
  endedAt: number | null;
  events: TranscriptEvent[];
}

/**
 * Slice a flat event stream into per-state sections keyed off state-transition
 * timestamps. The trailing section is the active one (`endedAt === null`).
 * When `transitions` is empty, falls back to a single section tagged with
 * `fallbackState`. Events that precede the first transition fold into the
 * first section so nothing is dropped.
 */
export function groupEventsByState(
  events: TranscriptEvent[],
  transitions: StateTransition[],
  fallbackState: AgentState,
): TimelineSectionData[] {
  if (transitions.length === 0) {
    const firstTs = events.length > 0 ? eventTs(events[0]) : NaN;
    const startedAt = Number.isFinite(firstTs) ? firstTs : Date.now();
    return [{ state: fallbackState, startedAt, endedAt: null, events: [...events] }];
  }

  const sorted = [...transitions].sort((a, b) => a.ts - b.ts);
  const sections: TimelineSectionData[] = sorted.map((t, i) => ({
    state: transitionToAgentState(t.to),
    startedAt: t.ts,
    endedAt: sorted[i + 1]?.ts ?? null,
    events: [],
  }));

  for (const event of events) {
    const ts = eventTs(event);
    let idx = -1;
    if (Number.isFinite(ts)) {
      idx = sections.findIndex(
        (s) => ts >= s.startedAt && (s.endedAt === null || ts < s.endedAt),
      );
    }
    if (idx === -1) idx = 0;
    const section = sections[idx];
    if (section) section.events.push(event);
  }

  return sections;
}

function eventTs(event: TranscriptEvent | undefined): number {
  if (!event?.timestamp) return NaN;
  return Date.parse(event.timestamp);
}
