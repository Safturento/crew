# CREW-196 — Render the initial-state section in the drawer Timeline

**Ticket:** [CREW-196](https://safturento.atlassian.net/browse/CREW-196)
**Epic:** [CREW-189 — Agent drawer Timeline polish](https://safturento.atlassian.net/browse/CREW-189)
**Date:** 2026-05-23

## Goal

The drawer Timeline doesn't render a section for the agent's **initial state** (typically `initializing` → labeled "Starting"). When transitions exist, only the post-transition `to_state` becomes a section; events that timestamp during the initial state get folded into the first transition's section and mis-labeled.

User-visible symptom: every dispatched agent's timeline opens with a "Running" section, never a "Starting" section, even though every dispatch goes through an initializing phase. With CREW-194's minimap making sections visually prominent, the missing leading segment is now obvious.

## Non-goals

- **Re-architecting state transitions.** The daemon's `state_transitions` table + ingest behavior stays the same. This is a pure presentation fix in `groupEventsByState`.
- **Changes to `transitionToAgentState`** or the underlying state vocabulary.
- **Fix-pr-run-related timeline behavior** — that's a separate concern, owned by the new Fix-pr Workflow Epic.

## Root cause

`packages/dashboard/src/components/Timeline/groupEventsByState.ts:30-35`:

```ts
const sorted = [...transitions].sort((a, b) => a.ts - b.ts);
const sections: TimelineSectionData[] = sorted.map((t, i) => ({
  state: transitionToAgentState(t.to),   // ← only uses `to_state`
  startedAt: t.ts,
  endedAt: sorted[i + 1]?.ts ?? null,
  events: [],
}));
```

N transitions → N sections, each labeled with the **`to`** state. The initial state (the `from` of the first transition, e.g. `initializing`) gets zero sections. Events that timestamp before the first transition fall through this guard:

```ts
if (idx === -1) idx = 0;   // folds initial-state events into the post-transition section
```

…and end up mis-attributed.

When `transitions.length === 0`, the existing code falls back to a single section using `fallbackState`. That branch is fine — covers the "agent hasn't transitioned yet" case correctly.

## Design (brainstormed 2026-05-23)

| Q | Decision |
|---|---|
| Always render the leading section when transitions exist? | **Yes**, even if the initializing period had zero events. Gives a complete state history; aligns with the minimap-as-state-map mental model. |
| Leading section's `state` source | `transitions[0].from`; fallback to `'initializing'` when `from === null` (the daemon currently stores `from: previous` where `previous` may be undefined on the very first transition). |
| Leading section's `startedAt` source | Earliest event timestamp if any events predate the first transition; else `transitions[0].ts` (zero-width section — still rendered, minimap min-clamp will give it the 16px floor). |
| Leading section's `endedAt` | First transition's `ts`. |

## Implementation

`groupEventsByState.ts` becomes:

```ts
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

  // Leading section for the initial state (events before the first transition).
  const earliestEventTs = events.length > 0 ? eventTs(events[0]) : NaN;
  const leadingStart =
    Number.isFinite(earliestEventTs) && earliestEventTs < first.ts
      ? (earliestEventTs as number)
      : first.ts;
  const initialFrom: TransitionState = first.from ?? 'initializing';
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
    if (idx === -1) idx = 0;  // unchanged fallback for unparseable ts
    const section = sections[idx];
    if (section) section.events.push(event);
  }

  return sections;
}
```

Net change: one extra section prepended to the result, and the event-assignment loop now correctly places pre-transition events.

## Testing

`groupEventsByState.test.ts` additions:

```ts
it('prepends a leading section for the initial state when transitions exist', () => {
  const events = [
    makeEvent({ ts: '2026-05-23T10:00:00Z' }),   // before first transition (initializing)
    makeEvent({ ts: '2026-05-23T10:05:00Z' }),   // after first transition (running)
  ];
  const transitions = [
    { from: 'initializing', to: 'running', ts: Date.parse('2026-05-23T10:03:00Z') },
  ];
  const sections = groupEventsByState(events, transitions, 'running');
  expect(sections).toHaveLength(2);
  expect(sections[0].state).toBe('initializing');
  expect(sections[0].events).toHaveLength(1);
  expect(sections[0].events[0]).toBe(events[0]);
  expect(sections[1].state).toBe('running');
  expect(sections[1].events).toHaveLength(1);
});

it('leading section uses transitions[0].from when present', () => {
  const transitions = [
    { from: 'idle', to: 'running', ts: 1000 },
  ];
  const sections = groupEventsByState([], transitions, 'running');
  expect(sections[0].state).toBe('idle');
});

it('leading section falls back to "initializing" when transitions[0].from is null', () => {
  const transitions = [
    { from: null as unknown as TransitionState, to: 'running', ts: 1000 },
  ];
  const sections = groupEventsByState([], transitions, 'running');
  expect(sections[0].state).toBe('initializing');
});

it('leading section is rendered even with zero events in the initial period', () => {
  const events = [
    makeEvent({ ts: '2026-05-23T10:10:00Z' }),  // all events post-transition
  ];
  const transitions = [
    { from: 'initializing', to: 'running', ts: Date.parse('2026-05-23T10:05:00Z') },
  ];
  const sections = groupEventsByState(events, transitions, 'running');
  expect(sections).toHaveLength(2);
  expect(sections[0].state).toBe('initializing');
  expect(sections[0].events).toHaveLength(0);
});

it('leading section startedAt uses earliest event ts when available', () => {
  const events = [makeEvent({ ts: '2026-05-23T10:00:00Z' })];
  const transitions = [
    { from: 'initializing', to: 'running', ts: Date.parse('2026-05-23T10:05:00Z') },
  ];
  const [leading] = groupEventsByState(events, transitions, 'running');
  expect(leading.startedAt).toBe(Date.parse('2026-05-23T10:00:00Z'));
});

it('leading section startedAt collapses to transition.ts when no events predate it', () => {
  const events = [makeEvent({ ts: '2026-05-23T10:10:00Z' })];
  const transitions = [
    { from: 'initializing', to: 'running', ts: Date.parse('2026-05-23T10:05:00Z') },
  ];
  const [leading] = groupEventsByState(events, transitions, 'running');
  expect(leading.startedAt).toBe(Date.parse('2026-05-23T10:05:00Z'));
});
```

Plus update any existing test that asserted section count from transition count — those tests are now off by one (N transitions → N+1 sections).

## Out of scope

- Filtering out zero-event leading sections via a config option (always-render is the answer).
- Special visual treatment for very short initial sections (CREW-194's min-clamp handles the minimap rendering).
- Changes to the daemon's transition recording (this is purely client-side).

## Risks

- **Existing tests may assert "N transitions → N sections".** They'll fail when leading section is added. Update them inline as part of the implementation; they were encoding the bug.
- **Snapshot/visual-fidelity reports baked the old behavior.** CREW-194's visual fidelity report was taken against a fixture where leading sections were absent. Re-running visual-fidelity-check against CREW-102 after this fix should show one extra section per multi-state agent; expected, not a regression.
