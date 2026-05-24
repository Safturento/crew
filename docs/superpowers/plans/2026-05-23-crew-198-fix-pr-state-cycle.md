# CREW-198 — Fix-pr state cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daemon fires `pr_open → running` when a new run starts producing tool_calls (detected via run_id change while `previous === 'pr_open'`), and fires `running → pr_open` on fix-pr run completion. Drawer Timeline naturally shows the cycle as a new Running section.

**Architecture:** Pure daemon-side change. Two new things: (a) `lastRunIdCache` per agent + extended `computeNextState`; (b) new `recordRunCompleted` method called from the existing run-completion lifecycle.

**Tech Stack:** TypeScript + Fastify + Kysely. No frontend changes.

**Spec:** [`docs/superpowers/specs/2026-05-23-crew-198-fix-pr-state-cycle-design.md`](../specs/2026-05-23-crew-198-fix-pr-state-cycle-design.md)
**Ticket:** [CREW-198](https://safturento.atlassian.net/browse/CREW-198) (Epic [CREW-197](https://safturento.atlassian.net/browse/CREW-197))

---

## Pre-work — locate the lifecycle hooks

```bash
grep -rn "recordFinishCompleted\|completed_at\|.update.*runs" packages/daemon/src --include='*.ts'
```

Find: (1) where `recordFinishCompleted` is called from (mirror that call site for `recordRunCompleted`), and (2) where `runs.completed_at` is set on successful run completion (might be the same site, might differ between `finish` / `run` / `fix-pr` commands). Note both locations.

If fix-pr doesn't currently signal "run completed" to the daemon (CLI just exits), surface that gap during pre-work — Task 3 may need to add the CLI-side signal.

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `packages/daemon/src/services/IngestService.ts` | `lastRunIdCache` field; `computeNextState` accepts ctx with run_id; `applyStateTransition` threads run_id; new `recordRunCompleted` method; prime cache on attach |
| Modify | `packages/daemon/src/services/IngestService.test.ts` | New test cases per spec § Testing |
| Modify (possible) | wherever `recordFinishCompleted` is called from | Mirror with `recordRunCompleted` for fix-pr command runs |
| Modify (possible) | `packages/cli/src/commands/fix-pr.ts` | If no run-completion signal exists today, post `POST /api/agents/:key/runs/:id/complete` or equivalent on exit |

---

## Task 1: `lastRunIdCache` + `computeNextState` extension

**Files:**
- Modify: `packages/daemon/src/services/IngestService.ts`
- Modify: `packages/daemon/src/services/IngestService.test.ts`

- [ ] **Step 1: Write failing tests**

Add the four `pr_open → running` tests from spec § Testing (new-run-id transition, no-transition within same run, no-transition on empty cache).

- [ ] **Step 2: Run, verify fail**

```bash
npm run test:run --workspace=crew-daemon -- IngestService
```

Expected: FAIL — current `computeNextState` early-returns at `previous === 'pr_open'` so the new-run-id case doesn't transition.

- [ ] **Step 3: Implement**

Per spec § Architecture:
- Add `private readonly lastRunIdCache = new Map<string, number>()` field to IngestService.
- Add `ComputeContext` interface + extend `computeNextState` signature.
- In `applyStateTransition`, look up `lastSeenRunId` from the cache, pass via ctx, then update the cache after inserting the transition (or always, regardless of whether transition fired — the cache should track the latest run regardless).

- [ ] **Step 4: Run, verify pass**

```bash
npm run test:run --workspace=crew-daemon -- IngestService
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/IngestService.ts \
        packages/daemon/src/services/IngestService.test.ts
git commit -m "feat(daemon): fire pr_open → running when a new run starts tool_calls (CREW-198)

lastRunIdCache tracks per-agent the run_id of the most recently
ingested tool_call. computeNextState gains a ctx with current/last
run_ids; when previous === 'pr_open' AND the run_id has changed,
returns 'running'. Pure ingest-side logic — no API changes."
```

---

## Task 2: `recordRunCompleted` method + lifecycle wiring

**Files:**
- Modify: `packages/daemon/src/services/IngestService.ts`
- Modify: `packages/daemon/src/services/IngestService.test.ts`
- Modify: lifecycle hook location (located in pre-work)

- [ ] **Step 1: Write failing tests for `recordRunCompleted`**

Per spec § Testing — two cases:
- `recordRunCompleted` for a fix-pr run fires `running → pr_open`
- `recordRunCompleted` for a non-fix-pr run is a no-op

- [ ] **Step 2: Verify fail**

Expected: FAIL — method doesn't exist.

- [ ] **Step 3: Implement `recordRunCompleted`**

Per spec § Architecture — guards on `previous === 'running'` and the run's `command === 'fix-pr'`.

- [ ] **Step 4: Wire into lifecycle**

Find the existing site that fills `runs.completed_at` on successful exit (per pre-work). Add a call to `recordRunCompleted` for fix-pr runs. If the lifecycle doesn't currently signal "run completed" for fix-pr (CLI just exits), add the signal:

- New route: `POST /api/agents/:key/runs/:runId/complete` (or extend an existing route)
- CLI's `fix-pr.ts` calls it on successful exit

If a CLI-side change is needed, fold that into this task or split into Task 2a.

- [ ] **Step 5: Re-run, verify pass**

```bash
npm run test:run --workspace=crew-daemon -- IngestService
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/services/IngestService.ts \
        packages/daemon/src/services/IngestService.test.ts \
        <lifecycle file>
git commit -m "feat(daemon): recordRunCompleted fires running → pr_open on fix-pr completion (CREW-198)

Mirrors recordFinishCompleted's shape but only fires when (a) previous
state is 'running', and (b) the completing run has command='fix-pr'.
Together with Task 1's pr_open → running trigger, this completes the
drawer's pr_open → running → pr_open cycle for fix-pr sessions."
```

---

## Task 3: Prime `lastRunIdCache` on agent attach

**Files:**
- Modify: `packages/daemon/src/services/IngestService.ts`
- Modify: `packages/daemon/src/services/IngestService.test.ts`

- [ ] **Step 1: Write failing test**

Per spec § Testing — `lastRunIdCache primes from latest tool_call on agent attach`.

- [ ] **Step 2: Verify fail**

Expected: FAIL — `attachAgent` (or equivalent) doesn't prime the cache.

- [ ] **Step 3: Implement priming**

In whatever method handles agent attach, query the latest tool_call's `run_id` for that agent and set the cache before any ingestion. Expose `_getLastRunIdForTest(agentKey)` (or equivalent) for the test.

- [ ] **Step 4: Run, verify pass**

```bash
npm run test:run --workspace=crew-daemon -- IngestService
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/IngestService.ts \
        packages/daemon/src/services/IngestService.test.ts
git commit -m "feat(daemon): prime lastRunIdCache on agent attach (CREW-198)

Daemon restarts mid-fix-pr-session won't miss the run_id-changed
transition signal — cache is seeded from the latest tool_call's
run_id before any post-restart ingestion."
```

---

## Task 4: Visual verification

- [ ] `npm run lint` — green
- [ ] `npm run typecheck` — green
- [ ] `npm run test:run` — green across workspaces
- [ ] `npm run bruno:smoke` — green
- [ ] **Manual:** dispatch a `crew fix-pr <KEY>` on an existing pr_open agent. Open drawer, confirm:
  - Original Running + PR open sections still present at the top
  - New Running section appears as soon as fix-pr starts firing tool_calls
  - After fix-pr completes successfully, a new PR open section appears at the bottom
  - Minimap shows all five sections in their state colors
- [ ] `visual-fidelity-check` skill (optional — change is structural-data, not visual)

PR title: `feat(daemon): pr_open → running → pr_open cycle for fix-pr runs (CREW-198)`
