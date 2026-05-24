# CREW-198 — Fix-pr timeline append + state cycle (pr_open → running → pr_open)

**Ticket:** [CREW-198](https://safturento.atlassian.net/browse/CREW-198)
**Epic:** [CREW-197 — Fix-pr workflow improvements](https://safturento.atlassian.net/browse/CREW-197)
**Date:** 2026-05-23

## Goal

When `crew fix-pr <KEY>` dispatches a new run on an agent that's already in `pr_open` state, the daemon should:

1. Fire a `pr_open → running` state transition as soon as the new run starts producing tool calls.
2. Fire a `running → pr_open` transition when the new run completes.

This makes the drawer Timeline render the fix-pr session as its own state-section (between the original `pr_open` section and the new post-completion `pr_open` section), instead of all events folding into the single lingering `pr_open` section because state never transitions.

## Non-goals

- **Auto-pushing fix-pr results.** Owned by sibling [CREW-199](https://safturento.atlassian.net/browse/CREW-199). #2 establishes the state-cycle wiring; #3 adds the push action that triggers it.
- **Generalized multi-run-per-agent support beyond fix-pr.** Cycle logic uses the same `pr_open → running → pr_open` shape that fix-pr produces; if future re-dispatches need different cycles (`finished → running → finished`?), extend then.
- **Visual differentiation between "initial Running section" and "fix-pr Running section."** Each is just a `Running` section per the existing state vocabulary. State-section's `startedAt` timestamp + the `Starting` section from CREW-196 give enough chronological context.
- **PR re-validation / auto-merge.** Out of scope per the Epic.

## Root cause analysis

`packages/daemon/src/services/IngestService.ts:395-404`:

```ts
function computeNextState(
  previous: TransitionState,
  toolName: string,
  summary: string,
): TransitionState {
  if (previous === 'finished') return 'finished';
  if (previous === 'pr_open') return 'pr_open';   // ← STICKS — fix-pr events never transition
  if (toolName === 'Bash' && summary.startsWith('gh pr create')) return 'pr_open';
  return 'running';
}
```

The early return at `previous === 'pr_open'` was correct for the original run (don't downgrade from pr_open back to running on subsequent activity in the same run). It's wrong when a fix-pr run lands subsequent activity that's structurally a **new run**.

## Design (brainstormed 2026-05-23)

| Q | Decision |
|---|---|
| `pr_open → running` trigger | **First tool_call from a new `run_id`**. When `previous === 'pr_open'` AND the tool_call's run_id differs from the run_id of the last tool_call we've ingested for this agent, fire `pr_open → running`. Pure ingest-side logic; works for any new run command (fix-pr / resume / future). |
| `running → pr_open` trigger | **Run completion** (`run.completed_at` filled). When the fix-pr run completes successfully, fire `running → pr_open`. Single canonical signal; no flicker on intermediate git pushes. |

## Architecture

### `applyStateTransition` — accept run_id, track last-seen run per agent

`IngestService.applyStateTransition` already receives the agent key + tool name + summary. Add `runId`:

```ts
private async applyStateTransition(input: {
  agentKey: string;
  runId: number;          // ← NEW
  toolName: string;
  summary: string;
  tsIso: string;
}): Promise<void> {
  const previous = await this.getCachedAgentState(input.agentKey);
  const lastRunId = this.lastRunIdCache.get(input.agentKey);
  const next = computeNextState(previous, input.toolName, input.summary, {
    currentRunId: input.runId,
    lastSeenRunId: lastRunId,
  });
  if (next !== previous) { /* existing insert + cache + publish */ }
  this.lastRunIdCache.set(input.agentKey, input.runId);
}
```

New `lastRunIdCache: Map<agentKey, runId>` field on the service, initialized empty. On `recordStart` (when agent attaches), populate from the latest tool_call's run_id in DB.

### `computeNextState` — new run_id triggers transition

```ts
interface ComputeContext {
  currentRunId: number;
  lastSeenRunId: number | undefined;
}

function computeNextState(
  previous: TransitionState,
  toolName: string,
  summary: string,
  ctx: ComputeContext,
): TransitionState {
  if (previous === 'finished') return 'finished';
  // pr_open → running when a NEW run starts producing tool_calls.
  if (
    previous === 'pr_open' &&
    ctx.lastSeenRunId !== undefined &&
    ctx.currentRunId !== ctx.lastSeenRunId
  ) {
    return 'running';
  }
  if (previous === 'pr_open') return 'pr_open';
  if (toolName === 'Bash' && summary.startsWith('gh pr create')) return 'pr_open';
  return 'running';
}
```

The `lastSeenRunId !== undefined` guard prevents the FIRST tool_call (when cache is empty after agent attach) from spuriously triggering the transition.

### Run-completion → pr_open

Daemon needs to detect when a fix-pr run completes successfully and fire `running → pr_open`.

`recordFinishCompleted` already handles the `finish` command's terminal transition (`* → finished`). Add a sibling for fix-pr run completion:

```ts
async recordRunCompleted(agentKey: string, runId: number, completedAtIso: string): Promise<void> {
  const previous = await this.getCachedAgentState(agentKey);
  // Only transition back if we were `running` (the fix-pr cycle's halfway point).
  if (previous !== 'running') return;

  // Confirm this run was actually a fix-pr (not the original `run` command —
  // we don't want a hung-up initial run to falsely transition to pr_open).
  const run = await this.db.selectFrom('runs').select('command').where('id', '=', runId).executeTakeFirst();
  if (run?.command !== 'fix-pr') return;

  const ts = Date.parse(completedAtIso);
  if (!Number.isFinite(ts)) return;

  await this.db.insertInto('state_transitions')
    .values({ agent_key: agentKey, from_state: 'running', to_state: 'pr_open', ts })
    .execute();
  this.agentStateCache.set(agentKey, 'pr_open');
  this.eventBus.publish({ type: 'agent.state_changed', data: { key: agentKey, from: 'running', to: 'pr_open', ts } });
}
```

Caller: wherever `recordFinishCompleted` is called from (likely the same lifecycle hook that fills `runs.completed_at` for the `finish` command), add a parallel call to `recordRunCompleted` for `fix-pr` commands.

### Timeline rendering

No frontend changes required. `groupEventsByState` (now CREW-196'd to render leading sections) will naturally render:

```
[Starting] → [Running] → [PR open] → [Running] → [PR open]    ← post-fix-pr
                                       ^^^^^^^
                                       new section from this ticket
```

Each section is bounded by the state_transitions table entries. The minimap from CREW-194 will show the two `pr_open` segments + the fix-pr `running` segment as distinct colored stripes.

### Run-attach cache priming

`lastRunIdCache` needs to be populated on daemon startup / agent attach so we don't fire spurious transitions when the daemon restarts mid-fix-pr-session.

In whichever method handles agent attach (likely `IngestService.attachAgent` or similar), query the latest tool_call's `run_id` for that agent and seed the cache:

```ts
const latestToolCall = await this.db
  .selectFrom('tool_calls')
  .innerJoin('runs', 'runs.id', 'tool_calls.run_id')
  .where('runs.agent_key', '=', agentKey)
  .orderBy('tool_calls.occurred_at', 'desc')
  .select('tool_calls.run_id')
  .executeTakeFirst();
if (latestToolCall) {
  this.lastRunIdCache.set(agentKey, latestToolCall.run_id);
}
```

## Testing

### `IngestService.test.ts` additions

```ts
it('fires pr_open → running when a new run starts producing tool_calls', async () => {
  // Agent in pr_open from a `run` command that ended with gh pr create.
  await ingest.processEventForTest({ runId: 1, agentKey: 'AGENT', event: makeAssistantEvent({ toolUse: { name: 'Bash', input: { command: 'gh pr create ...' } } }) });
  expect(await getState('AGENT')).toBe('pr_open');

  // Fix-pr dispatch creates run id 2. First tool_call from run 2 → transition.
  await ingest.processEventForTest({ runId: 2, agentKey: 'AGENT', event: makeAssistantEvent({ toolUse: { name: 'Bash', input: { command: 'ls' } } }) });
  expect(await getState('AGENT')).toBe('running');
});

it('does NOT transition pr_open → running on continued activity within the same run', async () => {
  // Within a single run that hit pr_open, subsequent tool_calls don't downgrade.
  await ingest.processEventForTest({ runId: 1, agentKey: 'AGENT', event: prCreateEvent });
  await ingest.processEventForTest({ runId: 1, agentKey: 'AGENT', event: bashEvent });
  expect(await getState('AGENT')).toBe('pr_open');
});

it('does NOT transition on the first-ever tool_call (empty lastRunIdCache)', async () => {
  // Fresh agent, no prior runs in cache. First tool_call from run 1 should
  // follow the existing running-state logic — not falsely trigger pr_open → running.
  await ingest.processEventForTest({ runId: 1, agentKey: 'AGENT', event: bashEvent });
  expect(await getState('AGENT')).toBe('running');
});

it('recordRunCompleted fires running → pr_open for fix-pr runs', async () => {
  // Set up: agent in `running` after a fix-pr run was detected.
  await ingest.processEventForTest({ runId: 1, agentKey: 'AGENT', event: prCreateEvent });
  await ingest.processEventForTest({ runId: 2, agentKey: 'AGENT', event: bashEvent });  // fix-pr run begins
  await insertRun(2, { agent_key: 'AGENT', command: 'fix-pr' });
  expect(await getState('AGENT')).toBe('running');

  await ingest.recordRunCompleted('AGENT', 2, '2026-05-23T15:00:00Z');
  expect(await getState('AGENT')).toBe('pr_open');
});

it('recordRunCompleted does NOT transition for non-fix-pr runs', async () => {
  // A regular `run` command completing shouldn't push the agent to pr_open.
  await insertRun(1, { agent_key: 'AGENT', command: 'run' });
  await ingest.processEventForTest({ runId: 1, agentKey: 'AGENT', event: bashEvent });
  expect(await getState('AGENT')).toBe('running');

  await ingest.recordRunCompleted('AGENT', 1, '2026-05-23T15:00:00Z');
  expect(await getState('AGENT')).toBe('running');  // unchanged
});

it('lastRunIdCache primes from latest tool_call on agent attach', async () => {
  await insertToolCall({ run_id: 5, agent_key: 'AGENT', tool_name: 'Bash', occurred_at: '2026-05-23T14:00:00Z' });
  await ingest.attachAgent('AGENT');  // or equivalent
  expect(ingest._getLastRunIdForTest('AGENT')).toBe(5);
});
```

### Bruno

Optional integration check: dispatch a fake fix-pr scenario, assert state-history endpoint returns the new transitions.

## Out of scope

- Sub-section labels distinguishing "Run 1" from "Fix-pr 1" in the timeline (state-section + timestamp is enough context).
- Detecting failed fix-pr runs and transitioning to `error` (handled by existing error pathways; this ticket only handles success path).
- Auto-push (CREW-199).

## Risks

- **Run-completion hook may not exist for `fix-pr`.** `finish` has explicit `recordFinishCompleted`. fix-pr might not have a parallel "run completed successfully" signal today; the CLI might just exit. If so, this ticket needs to add the signal (CLI tells daemon "run X completed" on exit).
- **lastRunIdCache + daemon restart.** If the daemon restarts mid-fix-pr-session, cache is empty. Priming from the latest tool_call's run_id keeps it correct — but if the very first ingestion after restart is a tool_call from a NEW run (priming hasn't happened yet), we might miss the transition. Mitigation: prime the cache as part of agent attach, before any event processing.
- **Multi-fix-pr sessions** (user runs fix-pr twice). Cycle should work: pr_open → running (fix-pr 1) → pr_open → running (fix-pr 2) → pr_open. Each run gets its own section. Tested via `recordRunCompleted` firing on each completion.
