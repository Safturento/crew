import type {
  AgentState,
  StateTransition,
  TranscriptEvent,
  TransitionState,
} from '../../data/types.js';
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
 * `fallbackState`. When at least one transition exists, a leading section is
 * prepended for the agent's initial state — the `from` of the first
 * transition (fallback `'initializing'`) — so events that timestamp before
 * any transition land in their own section instead of being mis-attributed.
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
  const first = sorted[0];
  if (!first) {
    // Unreachable: the length guard above ensures `sorted` is non-empty. Narrows
    // the type for downstream access without a non-null assertion.
    return [{ state: fallbackState, startedAt: Date.now(), endedAt: null, events: [...events] }];
  }

  const earliestEventTs = events.length > 0 ? eventTs(events[0]) : NaN;
  const leadingStart =
    Number.isFinite(earliestEventTs) && (earliestEventTs as number) < first.ts
      ? (earliestEventTs as number)
      : first.ts;
  // `TransitionState` is the daemon's narrower vocabulary (`'init'`, not
  // `'initializing'`). When `from` is null we fall back to `'init'` so the
  // lookup map produces the `'initializing'` AgentState the section needs.
  const initialFrom: TransitionState = first.from ?? 'init';
  const sections: TimelineSectionData[] = [
    {
      state: transitionToAgentState(initialFrom),
      startedAt: leadingStart,
      endedAt: first.ts,
      events: [],
    },
    ...sorted.map((t, i) => ({
      state: transitionToAgentState(t.to),
      startedAt: t.ts,
      endedAt: sorted[i + 1]?.ts ?? null,
      events: [] as TranscriptEvent[],
    })),
  ];

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
