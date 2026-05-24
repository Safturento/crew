# CREW-202 — Detect PR closure, transition agent to `pr_merged`

**Ticket:** [CREW-202](https://safturento.atlassian.net/browse/CREW-202)
**Epic:** [CREW-200 — Agent lifecycle observability](https://safturento.atlassian.net/browse/CREW-200)
**Date:** 2026-05-23

## Goal

When an agent's PR transitions out of OPEN (merged, or closed without merge), the daemon should detect it within a few minutes (5-min polling, optional instant via Refresh button) and transition the agent from `pr_open` to a new `pr_merged` state. In the dashboard:

- Agent's StateBadge changes to green + check icon, signaling "done — ready to clean up."
- Finish button becomes actionable (was non-actionable while pr_open).
- "View PR" wording updates to "View merged PR" with a `lucide/git-merge` icon.
- New drawer "Refresh PR status" button lets user force an immediate check.

User goal in their words: "the 'Finish' button is non-actionable while a PR is open, and the 'View PR' button is kind of pointless once the PR is merged" — both addressed by transitioning state when the PR closes.

## Non-goals

- **Distinguishing merged vs closed-without-merge at the state level.** Both folded into `pr_merged`; the close-without-merge case is <5% of usage. Drawer/StateBadge tooltip can carry the detail (`"PR #123 — merged"` vs `"PR #123 — closed"`) if needed.
- **GitHub webhook for realtime updates.** Polling is sufficient for v1; webhook tracked as a followup (see `docs/followups.md` § "Daemon, CLI & Dispatch" → 2026-05-23 GitHub webhook entry).
- **Polling `pr_merged` agents to detect re-opens.** Once `pr_merged`, polling stops. If a PR re-opens (rare), the user hits Refresh to re-detect.
- **Activity-based polling** (only poll when user has drawer open). Simpler to poll all `pr_open` agents uniformly at 5-min cadence.
- **Polling rate adaptation / exponential backoff.** Fixed cadence; no per-agent adaptive logic in v1.
- **Auto-finish on PR closure.** User explicitly wants the explicit "PR closed, click Finish to clean up" step — no auto-transition past `pr_merged`.

## Design decisions (brainstormed 2026-05-23, full pass)

| Q | Decision |
|---|---|
| Q1 — Detection mechanism | **Polling + manual Refresh button** combined. Daemon's poller runs every 5 minutes; drawer has a "Refresh PR status" button that triggers an on-demand check via a new daemon endpoint. Webhook is a future enhancement (followup parked). |
| Q2 — State vocabulary | **ONE new state: `pr_merged`** covering both merged and closed-without-merge. Single state simplifies vocabulary, UI, and color/icon work. Drawer tooltip carries the merged-vs-closed detail. |
| Q3 — UI treatment | **Green + check icon for `pr_merged`** (matches `finished`'s success semantic family). Finish button enabled. View PR rewords to "View merged PR" with `lucide/git-merge` icon. |
| Q4 — Polling cadence | **Fixed 5-minute interval per `pr_open` agent.** At 10 agents = 120 calls/hour (well under GitHub's 5000/hr authenticated limit). Manual Refresh button is the escape hatch for snappier UX. |
| Q5 — Scope | **Only poll `pr_open` agents.** Once an agent transitions to `pr_merged`, polling stops. Re-open edge case handled via manual Refresh. |

## Architecture

### Daemon — new `PrPoller` service

`packages/daemon/src/services/PrPoller.ts` (new):

```ts
export class PrPoller {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
    private readonly intervalMs = 5 * 60_000,  // 5 minutes
  ) {}

  start(): void {
    this.timer = setInterval(() => this.pollOnce().catch((err) =>
      this.logger.warn({ err }, 'PR poll round failed'),
    ), this.intervalMs);
    // Also kick off a first poll on start so we don't wait 5min after daemon boot
    void this.pollOnce();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Public: callable from the manual Refresh route for one agent. */
  async checkAgent(agentKey: string): Promise<{ stateChanged: boolean; newState?: AgentState }> {
    const agent = await this.db.selectFrom('agents')
      .select(['key', 'pr_url'])
      .where('key', '=', agentKey)
      .executeTakeFirst();
    if (!agent?.pr_url) return { stateChanged: false };
    return this.checkOne(agent.key, agent.pr_url);
  }

  private async pollOnce(): Promise<void> {
    // Read current pr_open agents from the state cache (or by joining state_transitions)
    const openAgents = await this.db.selectFrom('agents as a')
      .innerJoin(/* latest state_transitions */)
      .where('latest_to_state', '=', 'pr_open')
      .where('a.pr_url', 'is not', null)
      .select(['a.key', 'a.pr_url'])
      .execute();

    for (const agent of openAgents) {
      await this.checkOne(agent.key, agent.pr_url).catch((err) =>
        this.logger.warn({ err, key: agent.key }, 'per-agent PR check failed'),
      );
    }
  }

  private async checkOne(agentKey: string, prUrl: string): Promise<{ stateChanged: boolean; newState?: AgentState }> {
    // Precondition: only transition from pr_open. The poller's pollOnce filters this,
    // but the public checkAgent path (manual Refresh button) can be called from any state,
    // so re-verify here.
    const currentState = await getCurrentAgentState(this.db, agentKey);
    if (currentState !== 'pr_open') return { stateChanged: false };

    const prState = await fetchPrStateViaGh(prUrl);  // see helper below
    if (prState === 'OPEN') return { stateChanged: false };

    // MERGED or CLOSED → transition to pr_merged
    const ts = Date.now();
    await this.db.insertInto('state_transitions')
      .values({ agent_key: agentKey, from_state: 'pr_open', to_state: 'pr_merged', ts })
      .execute();
    this.eventBus.publish({
      type: 'agent.state_changed',
      data: { key: agentKey, from: 'pr_open', to: 'pr_merged', ts },
    });
    return { stateChanged: true, newState: 'pr_merged' };
  }
}
```

Boot the service in `serve.ts` (or wherever existing services are wired):

```ts
const prPoller = new PrPoller(db, eventBus, logger);
prPoller.start();
// graceful shutdown hook: prPoller.stop()
```

### `fetchPrStateViaGh` helper

`packages/daemon/src/services/github/fetch-pr-state.ts` (new):

```ts
import { execa } from 'execa';

export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

/**
 * Hits `gh pr view <prUrl> --json state,merged` and normalizes the response.
 * Returns 'MERGED' when merged: true; 'CLOSED' when state=CLOSED + merged: false; 'OPEN' otherwise.
 */
export async function fetchPrStateViaGh(prUrl: string): Promise<PrState> {
  const { stdout } = await execa('gh', ['pr', 'view', prUrl, '--json', 'state,merged']);
  const { state, merged } = JSON.parse(stdout) as { state: 'OPEN' | 'CLOSED' | 'MERGED'; merged: boolean };
  if (merged) return 'MERGED';
  if (state === 'CLOSED') return 'CLOSED';
  return 'OPEN';
}
```

Note: `gh pr view <url>` accepts the full PR URL directly. We don't need to parse owner/repo/number ourselves.

### State vocabulary extension

Add `pr_merged` to:
- `packages/daemon/src/services/AgentsService.ts` — `AgentState` type union
- `packages/daemon/src/db.ts` — `state_transitions.to_state` and `from_state` enums
- `packages/daemon/src/migrations/0002_state_transitions.ts` — already has a CHECK constraint listing allowed values; a new migration (`0NNN_state_transitions_pr_merged.ts`) drops + recreates the constraint with `pr_merged` added
- `packages/daemon/src/routes/agents.ts` — `AgentStateEnum` Zod schema
- `packages/dashboard/src/data/types.ts` — `AgentState` type
- `packages/dashboard/src/data/state-meta.ts` — `STATE_META` entry + `STATE_CLASSES` entry

`state-meta.ts` additions:

```ts
// STATE_META
pr_merged: { label: 'PR merged', attention: false, sortRank: 2.5 },  // between pr_open (2) and running (3)

// STATE_CLASSES — green family, mirroring whatever `finished` uses
pr_merged: {
  text: 'text-green-400',
  bg: 'bg-green-1050',
  border: 'border-green-500',
  solidBg: 'bg-green-400',
  solidBorder: 'border-green-400',
},
```

(Exact green shade matches `finished` if that's the existing pattern; otherwise pick the closest analogous shade — implementer verifies in the live palette.)

### Manual Refresh button — new route + drawer integration

**Daemon route** `packages/daemon/src/routes/agents.ts`:

```ts
fastify.post('/api/agents/:key/refresh-pr-status', {
  schema: { params: z.object({ key: z.string() }) },
}, async (req) => {
  const result = await prPoller.checkAgent(req.params.key);
  return result;
});
```

**Dashboard drawer button** in `packages/dashboard/src/components/DrawerHeader.tsx`:

```tsx
{detail.state === 'pr_open' && detail.pr_url && (
  <Button
    color="idle"
    intensity="ghost"
    size="sm"
    icon={<RefreshCw aria-hidden />}
    onClick={() => refreshPrStatus(detail.key)}
    aria-label="Refresh PR status"
  >
    Refresh PR
  </Button>
)}
```

Add a `refreshPrStatus` client helper in `packages/dashboard/src/data/HttpDaemonClient.ts` that calls `POST /api/agents/<key>/refresh-pr-status` and invalidates the relevant queries on response.

### Button logic in `AgentRow.tsx`

Extend `QuickActions` (already case-matches `agent.state`) to add the `pr_merged` case:

```tsx
case 'pr_merged':
  return (
    <QaGroup>
      <Button
        color="running"
        intensity="mid"
        size="sm"
        icon={<GitMerge aria-hidden />}
        asChild
      >
        <a href={agent.prUrl ?? '#'} target="_blank" rel="noreferrer" onClick={stop}>
          View merged PR
        </a>
      </Button>
      <Button color="running" intensity="ghost" size="sm" onClick={fire('finish')}>
        Finish
      </Button>
    </QaGroup>
  );
```

`GitMerge` from `lucide-react`. Same shape as the existing `pr_open` case but reworded + different icon.

### DrawerHeader — also update "View PR" wording when `pr_merged`

```tsx
// In DrawerHeader.tsx, the existing PR pill:
{detail.jira_url && (
  <Button
    color="idle"
    intensity="mid"
    size="md"
    icon={detail.state === 'pr_merged'
      ? <GitMerge aria-hidden />
      : <SquareArrowOutUpRight aria-hidden />}
    asChild
  >
    <a href={detail.jira_url} target="_blank" rel="noreferrer">
      {detail.state === 'pr_merged' ? 'Merged PR' : detail.ticket_key}
    </a>
  </Button>
)}
```

(Adapt to actual existing DrawerHeader structure — the snippet shows intent.)

## State-cycle interactions

This ticket interacts with two adjacent flows:

1. **CREW-198 (fix-pr state cycle):** CREW-198 wires `pr_open → running → pr_open` for fix-pr re-runs. If a fix-pr lands while the new `pr_merged` ticket has shipped, the cycle becomes `pr_open → running → pr_open` (if PR still open) OR `pr_open → running → pr_merged` (if PR was merged during the fix-pr session). Both work cleanly because CREW-198's `recordRunCompleted` consults current PR state on completion; if the PR is now merged, transitioning to `pr_merged` instead of `pr_open` is the right behavior. Implementer should add a check.

2. **CREW-199 (auto-push):** The auto-push at end of fix-pr can also be a trigger to re-check PR state. Not required — the next 5-min poll catches it — but a one-shot `checkAgent` call immediately after the push could surface the merge faster if the agent's push triggered an auto-merge.

Neither is a hard dependency; CREW-202 ships standalone.

## Testing

### `PrPoller.test.ts`

- `checkAgent` for a pr_open agent whose GitHub PR is now MERGED → fires `pr_open → pr_merged` transition; publishes event.
- `checkAgent` for a pr_open agent whose PR is CLOSED (not merged) → still fires `pr_open → pr_merged` (single state covers both).
- `checkAgent` for a pr_open agent whose PR is still OPEN → no transition, no event.
- `checkAgent` for an agent with null pr_url → no-op, no error.
- `checkAgent` for an agent in `pr_merged` state already → no transition (idempotent).
- `pollOnce` iterates only over agents in `pr_open` with non-null pr_url.

### `fetch-pr-state.test.ts`

- Mocks `execa('gh', ...)` to return canned JSON for each PR state.
- `merged: true` → MERGED regardless of `state`.
- `state: CLOSED, merged: false` → CLOSED.
- `state: OPEN, merged: false` → OPEN.

### Route test

- `POST /api/agents/:key/refresh-pr-status` returns `{stateChanged, newState?}` shape.
- Calls through to `PrPoller.checkAgent`.

### Bruno smoke

- New request in `bruno/endpoints/agents/refresh-pr-status.bru` — assert the response shape against a fixture agent.

### Frontend

- `AgentRow.test.tsx` — `pr_merged` state renders Finish + "View merged PR" buttons with the correct icons.
- `DrawerHeader.test.tsx` — Refresh PR button appears in `pr_open` state, hidden in `pr_merged`.
- `state-meta.test.ts` (new or extended) — `STATE_META.pr_merged` + `STATE_CLASSES.pr_merged` present with the expected values.

## Out of scope

- GitHub webhook for realtime detection (followup parked in `docs/followups.md`).
- Distinguishing merged vs closed-not-merged at the state level (handled in drawer tooltip, not state).
- Polling `pr_merged` agents to detect re-opens (manual Refresh handles it).
- Activity-based polling (uniform 5-min cadence).
- Auto-finish on PR close.
- Per-org / per-repo polling-cadence overrides.
- Multi-PR-per-agent support (assumes 1:1 agent ↔ PR).

## Risks

- **GitHub API rate limit.** Fixed 5-min cadence at typical scale (≤20 pr_open agents) is well under the 5000/hr limit. If usage grows past 100 pr_open agents continuously, we'd hit ~1200 calls/hour — still safe, but worth a future "adaptive cadence" pass.
- **`gh` binary availability in the daemon container.** Daemon container needs `gh` CLI installed + authenticated. Existing CLI already depends on this; daemon currently doesn't. Implementer extends the daemon Dockerfile to install `gh` + ensures auth token is mounted (e.g. shared volume with the host's `~/.config/gh/`).
- **Auth scope.** `gh pr view` works on private repos with the right token scopes. If a user's gh token doesn't have repo access for some agents (cross-org), polling silently fails. Mitigation: log per-agent failures clearly; surface in the drawer if it persistently fails (out of scope for v1).
- **Polling state survives daemon restart.** Setting up a `setInterval` in `serve.ts` is enough — daemon restart re-schedules from scratch. No persistent polling state needed.
- **State-transition race with CREW-198 (fix-pr state cycle).** If a fix-pr is running (pr_open → running) and the poll fires, it'd attempt pr_open → pr_merged. Mitigation: poller checks current state before transitioning; only fires when state IS `pr_open` (handled in `checkAgent`'s precondition).

## Followup binding

- `docs/followups.md` 2026-05-23 entry "GitHub webhook as a future PR-status detection mechanism" tracks the webhook deferred option — points at this Epic. Not required for v1 but should be revisited after the Tailscale exposure story is more concrete.
