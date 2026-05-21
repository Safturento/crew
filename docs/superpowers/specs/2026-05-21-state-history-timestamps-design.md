# State History — timestamps, elapsed, and layout exploration

## Background

`StateHistoryBar` (`packages/dashboard/src/components/StateHistoryBar.tsx`) renders a horizontal, flex-wrap chain of state pills connected by `→` arrows. Each pill is the state's display label only — no time information. The Figma source (`9FeJPriqdsdA4n9R5Xsrr8`, node `220-257`) matches the rendered output but is built from raw fills/text rather than DS composites.

Two problems motivate this design pass:

1. **Missing time information.** The original mock showed timestamps on each pill (`initializing 14:46:00 → running 14:46:14`); the implementation dropped them. Without time data, the history can't answer "how long did it spend waiting?" or "when did it transition?"
2. **Narrow-width wrapping.** Runs commonly have 5–9 transitions. At drawer-narrow widths (mobile-collapsed, ≈360px content), the current layout wraps awkwardly mid-chain, breaking the visual continuity of the `→` separators.

This spec covers the **visual design exploration** only. Implementation (swapping raw pills for Pill composites, wiring time data, adding the tooltip primitive if absent) is a separate follow-up once a direction is approved.

## Decisions

| Decision | Choice |
| --- | --- |
| What's visible on the chip / row | **Elapsed time in state** (e.g. `8s`, `2m 12s`) |
| What's in the tooltip | **Absolute timestamp** (e.g. `14:46:14`) |
| Tooltip behavior | **Styled** (DS-token-bound, not browser default); **tap-accessible on mobile** |
| Current/active state | **Live ticker** — elapsed counts up in real time while state is current |
| Directions to mock | **All three of A, B, C** (see below) |
| Widths to mock | **Both wide and narrow** for each direction |
| Figma location | **Scratch exploration frame** on the `Composites` page; promote keepers later |

## The three directions

Each direction is mocked at two widths:

- **Wide** — drawer at `max-w-5xl` on a desktop viewport, content area ≈960px.
- **Narrow** — drawer collapsed to full mobile width, content area ≈360px.

Each direction is mocked with **two state-count scenarios** to stress-test wrap behavior:

- **Typical** — 5 states: `initializing → running → waiting → pr_open → finished`
- **Long** — 8 states: `initializing → running → waiting → running → waiting → running → pr_open → finished`

### Direction A — Evolved horizontal pills

Closest to the current implementation. Each pill becomes `[● label · elapsed]`; arrows remain between pills; flex-wrap kept. Elapsed renders in a muted weight inside the pill.

```
[● init 0s] → [● running 8s] → [● waiting 2m12s] → [● pr_open] → [○ finished live]
```

- **Pro:** smallest visual jump from today; reuses existing Pill type
- **Con:** chips get fatter; wrap still happens at narrow widths

### Direction B — Proportional segment bar

A single horizontal bar broken into colored segments. Segment width is proportional to time-in-state; labels/elapsed sit inside the segment. No wrap — bar always fills the available width.

```
┌────┬────────┬──────────────────────────┬─────────┐
│init│ running│         waiting          │ pr_open │
│ 0s │   8s   │          2m12s           │  live   │
└────┴────────┴──────────────────────────┴─────────┘
```

- **Pro:** never wraps; visual outliers (long stalls) jump out at a glance
- **Con:** very short states get squeezed; labels truncate at narrow widths

### Direction C — Vertical timeline

One row per state with a connector line on the left. Each row carries `dot · label · timestamp · elapsed`. Current state gets a hollow / pulsing dot and a live elapsed counter.

```
●  init        14:46:00    0s
│
●  running     14:46:08    8s
│
●  waiting     14:46:16    2m 12s
│
○  pr_open     14:48:28    live · 14s
```

- **Pro:** scales to any state count; never wraps; room for both timestamp and elapsed without hiding either
- **Con:** uses more vertical space; less compact "at-a-glance" history

## Out of scope

- Implementation of the chosen direction in `StateHistoryBar.tsx`
- Adding a tooltip primitive to the DS if one doesn't already exist (separate evaluation)
- Migrating the existing raw-fill Figma node `220-257` to composites (this is the next design pass once a direction is picked)
- Backend changes — `transitions[]` already carries `ts`, so all needed data is present client-side

## Acceptance

1. All three directions exist in Figma on the `Composites` page in a scratch exploration frame, at both wide and narrow widths, with both 5-state and 8-state scenarios.
2. Each direction visibly uses Crew DS tokens (colors via state-token bindings, type via DS text styles, spacing via DS spacing tokens).
3. The current state is visually distinguished (hollow dot or equivalent) and labelled to convey the live-ticker intent.
4. User picks a direction (or a hybrid) to take forward into the implementation pass.
