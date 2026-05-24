# CREW-201 — Startup capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CLI emits per-phase startup events to `~/.crew/startup/<key>.jsonl`; daemon ingests via chokidar into a new `startup_events` table; Timeline endpoint merges with transcript events; TranscriptRow renders the new system subtypes with human-readable labels.

**Architecture:** New data flow, not a refactor. CLI writer → JSONL file → daemon chokidar → new table → timeline merge → existing TranscriptRow render. Failed phases fire `recordError` to transition agent to `error` state.

**Tech Stack:** TypeScript across all three packages (cli/daemon/shared). chokidar (already used by daemon). No new deps.

**Spec:** [`docs/superpowers/specs/2026-05-23-crew-201-startup-capture-design.md`](../specs/2026-05-23-crew-201-startup-capture-design.md)
**Ticket:** CREW-201 (Epic [CREW-200](https://safturento.atlassian.net/browse/CREW-200))

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `packages/shared/src/types.ts` | Add `StartupEvent` type variant; extend `TranscriptEvent` union |
| Create | `packages/cli/src/lib/startup-events/writer.ts` | `emitStartupEvent(key, event)` |
| Create | `packages/cli/src/lib/startup-events/writer.test.ts` | Writer unit tests |
| Modify | `packages/cli/src/lib/run/bringup.ts` (or per-phase files) | Bracket each phase with started/completed/failed `emitStartupEvent` calls |
| Create | `packages/daemon/src/migrations/00NN_startup_events.ts` | New table |
| Modify | `packages/daemon/src/db.ts` | Add `StartupEventsTable` to interfaces |
| Modify | `packages/daemon/src/services/IngestService.ts` | Chokidar watcher; `ingestStartupEvent`; `recordError` on failed phase |
| Modify | `packages/daemon/src/services/IngestService.test.ts` | Tests for new ingest path |
| Modify | `packages/daemon/src/services/AgentsService.ts` | `getTimeline` merges startup_events |
| Modify | `packages/daemon/src/services/AgentsService.test.ts` | Merge tests |
| Modify | `packages/dashboard/src/components/Timeline/event-labels.ts` | Add 5 startup phase labels |
| Modify | `packages/dashboard/src/components/Timeline/event-labels.test.ts` | Coverage |
| Modify | `packages/dashboard/src/components/Timeline/TranscriptRow.tsx` | `specForSystem` reads `status` for error tone |
| Modify | `packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx` | Startup-event rendering tests |
| Modify | `bruno/endpoints/agents/get-timeline.bru` | Assert startup_events merged when present |

---

## Task 1: Shared type for `StartupEvent`

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Write failing typecheck test or shape pin**

Add to existing types test (or create):

```ts
import { describe, expect, it } from 'vitest';
import type { StartupEvent } from './types.js';

describe('StartupEvent', () => {
  it('shape pin', () => {
    const e: StartupEvent = {
      type: 'system',
      subtype: 'crew_startup_npm_install',
      status: 'completed',
      timestamp: '2026-05-23T10:00:00Z',
      summary: 'installed 152 packages',
      durationMs: 1234,
    };
    expect(e.type).toBe('system');
  });
});
```

- [ ] **Step 2: Run, verify fails (type error)**
- [ ] **Step 3: Add `StartupEvent` to types.ts**

Per spec § Event shape. Union into `TranscriptEvent` so it flows through the existing event-handling code paths.

- [ ] **Step 4: Run, verify passes**
- [ ] **Step 5: Commit**

---

## Task 2: CLI writer + tests

**Files:**
- Create: `packages/cli/src/lib/startup-events/writer.ts`
- Create: `packages/cli/src/lib/startup-events/writer.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it('appends a JSON line to ~/.crew/startup/<key>.jsonl', async () => {
  // mock fs or use tmpdir; assert file content matches
});

it('creates the dir if absent', async () => { /* ... */ });

it('appends multiple events as separate JSONL lines', async () => { /* ... */ });
```

- [ ] **Step 2: Verify fails**
- [ ] **Step 3: Implement `emitStartupEvent`** per spec § Architecture
- [ ] **Step 4: Re-run, verify passes**
- [ ] **Step 5: Commit**

---

## Task 3: CLI dispatch — instrument each phase

**Files:**
- Modify: phase-specific files in `packages/cli/src/lib/run/` (worktree bringup, npm install, docker bringup, mcp wiring, claude spawn)

Five phases, each gets `emitStartupEvent` calls bracketing started / completed / failed. Per-phase: write the started event before doing the work; write completed after success; write failed in the catch block before re-throwing.

- [ ] **Step 1: Locate each phase site**

```bash
grep -rn "npm ci\|npm install\|docker compose up\|writeMcpFile\|claude' " packages/cli/src --include='*.ts' | head
```

Identify the function for each phase. Note the agent key is in scope.

- [ ] **Step 2: Write started/completed/failed brackets in one phase first (e.g. npm install)**

Per spec template. Run the existing dispatch test for that phase; should still pass (events are additive).

- [ ] **Step 3: Repeat for remaining phases**
- [ ] **Step 4: Snapshot-test the full sequence**

Integration test: dispatch a no-op fixture; assert `~/.crew/startup/<key>.jsonl` contains the expected 5×3 (started + completed for each phase, 0 failures in happy path).

- [ ] **Step 5: Commit per phase (5 separate commits) or one squashed (depending on team preference)**

---

## Task 4: Daemon migration + db.ts table type

**Files:**
- Create: `packages/daemon/src/migrations/00NN_startup_events.ts`
- Modify: `packages/daemon/src/db.ts`

- [ ] **Step 1: Determine next migration number**

```bash
ls packages/daemon/src/migrations/ | sort | tail -1
```

- [ ] **Step 2: Write migration**

Per spec § Daemon storage. Up + down.

- [ ] **Step 3: Add `StartupEventsTable` interface to `db.ts`**

```ts
export interface StartupEventsTable {
  id: number;
  agent_key: string;
  subtype: string;
  status: 'started' | 'completed' | 'failed';
  ts: number;
  summary: string;
  duration_ms: number | null;
  log_path: string | null;
}

export interface DB {
  // existing tables
  startup_events: StartupEventsTable;
}
```

- [ ] **Step 4: Run migration tests**

```bash
npm run test:run --workspace=crew-daemon -- migrations
```

Expected: new migration runs cleanly; existing migrations still pass.

- [ ] **Step 5: Commit**

---

## Task 5: Daemon chokidar watcher + ingest

**Files:**
- Modify: `packages/daemon/src/services/IngestService.ts`
- Modify: `packages/daemon/src/services/IngestService.test.ts`

- [ ] **Step 1: Write failing tests**

Per spec § Testing:
- Chokidar add event → events parsed and inserted into `startup_events`.
- Duplicate event (re-read same line) → dedupe.
- Failed event → triggers state transition to `error`.

- [ ] **Step 2: Verify fails**
- [ ] **Step 3: Implement `watchStartupEvents` + `onStartupFile` + `ingestStartupEvent`**

Per spec § Daemon ingest. Wire into IngestService's existing startup (likely called from `start()` or constructor).

`recordError` helper: if doesn't exist yet, add it as a sibling of `recordFinishCompleted` — transitions `initializing → error` with the event's ts. Guarded against re-transitioning if already error.

- [ ] **Step 4: Re-run, verify passes**
- [ ] **Step 5: Commit**

---

## Task 6: Timeline endpoint merges startup events

**Files:**
- Modify: `packages/daemon/src/services/AgentsService.ts`
- Modify: `packages/daemon/src/services/AgentsService.test.ts`
- Modify: `bruno/endpoints/agents/get-timeline.bru`

- [ ] **Step 1: Write failing tests**

- `getTimeline` merges startup events ahead of transcript events by ts.
- Empty startup-events table → transcript-only response.
- Mixed: startup events at ts T1, transcript events at T2, returns sorted union.

- [ ] **Step 2: Verify fails**
- [ ] **Step 3: Implement merge** per spec § Timeline endpoint
- [ ] **Step 4: Update Bruno smoke**

Assert a known fixture agent has both event types merged in chronological order.

- [ ] **Step 5: Re-run, verify passes**
- [ ] **Step 6: Commit**

---

## Task 7: Frontend rendering — labels + tone

**Files:**
- Modify: `packages/dashboard/src/components/Timeline/event-labels.ts`
- Modify: `packages/dashboard/src/components/Timeline/event-labels.test.ts`
- Modify: `packages/dashboard/src/components/Timeline/TranscriptRow.tsx`
- Modify: `packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it('renders crew_startup_npm_install with the "npm install" label', () => { /* ... */ });
it('renders failed startup events with error tone (red)', () => { /* ... */ });
it('expanded view shows the logPath when present', () => { /* ... */ });
```

- [ ] **Step 2: Verify fails**
- [ ] **Step 3: Implement label additions + `specForSystem` tone-from-status branch**

Per spec § Frontend rendering.

- [ ] **Step 4: Re-run, verify passes**
- [ ] **Step 5: Commit**

---

## Task 8: Manual smoke + visual fidelity

- [ ] `npm run lint` / `typecheck` / `test:run` / `bruno:smoke` — green
- [ ] Manual: dispatch a fresh `crew run <KEY>`. Drawer Timeline's Starting section shows 5 phase rows (one per phase), all green for happy path.
- [ ] Manual failure-path: deliberately break one phase (e.g. typo in worktree command); confirm the failed row renders red and the agent transitions to `error` state.
- [ ] `visual-fidelity-check` against the populated CREW-102 fixture (if it carries startup events; if not, dispatch a fresh agent for the check).

PR title: `feat: capture CLI startup phases in drawer Timeline (CREW-201)`
