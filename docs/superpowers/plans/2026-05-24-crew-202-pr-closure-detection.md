# CREW-202 — PR closure detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daemon polls GitHub every 5 min for each `pr_open` agent and transitions `pr_open → pr_merged` when the PR is no longer OPEN. New drawer "Refresh PR" button forces an immediate check. New `pr_merged` state renders green + check icon; Finish becomes actionable; "View PR" rewords to "View merged PR" with `lucide/git-merge` icon.

**Architecture:** New `PrPoller` daemon service + `fetchPrStateViaGh` helper. New `POST /api/agents/:key/refresh-pr-status` route. State vocabulary extended across shared types + daemon migration + dashboard `STATE_META`/`STATE_CLASSES`. Dashboard AgentRow + DrawerHeader gain `pr_merged` cases. Daemon Dockerfile installs `gh` CLI.

**Tech Stack:** TypeScript across daemon + dashboard. `gh` CLI for PR-state queries. `execa` (already a daemon dep through CLI shared paths — verify) or native `child_process.spawn`. No new runtime deps.

**Spec:** [`docs/superpowers/specs/2026-05-23-crew-202-pr-closure-detection-design.md`](../specs/2026-05-23-crew-202-pr-closure-detection-design.md)
**Ticket:** CREW-202 (Epic [CREW-200](https://safturento.atlassian.net/browse/CREW-200))

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `packages/shared/src/types.ts` | Add `pr_merged` to `AgentState` + `TransitionState` unions |
| Create | `packages/daemon/src/migrations/00NN_pr_merged_state.ts` | Drop + recreate `state_transitions` CHECK constraint to include `pr_merged` |
| Modify | `packages/daemon/src/db.ts` | Add `pr_merged` to `StateTransitionsTable.from_state` + `to_state` enums |
| Modify | `packages/daemon/src/services/AgentsService.ts` | Add `pr_merged` to `AgentState` type union (mirror of shared types) |
| Modify | `packages/daemon/src/services/IngestService.ts` | Add `pr_merged` to `TransitionState` + `isTransitionState` guard |
| Modify | `packages/daemon/src/routes/agents.ts` | Add `pr_merged` to `AgentStateEnum` Zod schema |
| Create | `packages/daemon/src/services/github/fetch-pr-state.ts` | `fetchPrStateViaGh(prUrl)` returning `'OPEN' | 'MERGED' | 'CLOSED'` |
| Create | `packages/daemon/src/services/github/fetch-pr-state.test.ts` | Helper unit tests |
| Create | `packages/daemon/src/services/PrPoller.ts` | Background poller + on-demand `checkAgent(key)` |
| Create | `packages/daemon/src/services/PrPoller.test.ts` | Service unit tests |
| Modify | `packages/daemon/src/serve.ts` (or wherever services boot) | Instantiate + start PrPoller; graceful shutdown |
| Modify | `packages/daemon/src/routes/agents.ts` | New `POST /api/agents/:key/refresh-pr-status` route |
| Modify | `packages/daemon/src/routes/agents.test.ts` | Route test |
| Create | `bruno/endpoints/agents/refresh-pr-status.bru` | Smoke against the new route |
| Modify | `packages/daemon/Dockerfile` | `apt-get install gh` (GitHub CLI) |
| Modify | `packages/dashboard/src/data/types.ts` | Add `pr_merged` to `AgentState` |
| Modify | `packages/dashboard/src/data/state-meta.ts` | `STATE_META.pr_merged` + `STATE_CLASSES.pr_merged` |
| Modify | `packages/dashboard/src/data/state-meta.test.ts` | Coverage of new entries |
| Modify | `packages/dashboard/src/data/HttpDaemonClient.ts` | `refreshPrStatus(key)` client helper |
| Modify | `packages/dashboard/src/data/queries.ts` | `useRefreshPrStatus(key)` mutation hook invalidating agent + state-history queries |
| Modify | `packages/dashboard/src/components/AgentRow.tsx` | New `case 'pr_merged'` in `QuickActions` |
| Modify | `packages/dashboard/src/components/AgentRow.test.tsx` | `pr_merged` rendering tests |
| Modify | `packages/dashboard/src/components/DrawerHeader.tsx` | Refresh PR button (when `pr_open`); "Merged PR" wording when `pr_merged` |
| Modify | `packages/dashboard/src/components/DrawerHeader.test.tsx` | Button visibility + wording tests |

---

## Task 1: Extend `AgentState` / `TransitionState` to include `pr_merged` (shared types)

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Write failing test**

Add to (or create) `packages/shared/src/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AgentState, TransitionState } from './types.js';

describe('AgentState', () => {
  it('includes pr_merged', () => {
    const s: AgentState = 'pr_merged';
    expect(s).toBe('pr_merged');
  });
});

describe('TransitionState', () => {
  it('includes pr_merged', () => {
    const s: TransitionState = 'pr_merged';
    expect(s).toBe('pr_merged');
  });
});
```

- [ ] **Step 2: Run, verify fails (type error)**

```bash
npm run typecheck --workspace=crew-shared
```

Expected: FAIL on `'pr_merged' is not assignable to type 'AgentState'`.

- [ ] **Step 3: Add `pr_merged` to both unions in `types.ts`**

Find the `AgentState` and `TransitionState` type definitions; add `| 'pr_merged'` to each. Both currently include `'initializing' | 'running' | 'waiting' | 'pr_open' | 'error' | 'finished' | 'idle'` — add the new variant.

- [ ] **Step 4: Re-run, verify passes**

```bash
npm run typecheck --workspace=crew-shared && npm run test:run --workspace=crew-shared -- types
```

- [ ] **Step 5: Commit**

```bash
cd /home/safturento/Repos/crew/.planning-worktrees/CREW-202
git add packages/shared/src/types.ts packages/shared/src/types.test.ts
git commit -m "feat(shared): add pr_merged to AgentState + TransitionState (CREW-202)"
```

---

## Task 2: Daemon — `state_transitions` CHECK migration + db.ts table type

**Files:**
- Create: `packages/daemon/src/migrations/00NN_pr_merged_state.ts` (use next migration number)
- Modify: `packages/daemon/src/db.ts`

- [ ] **Step 1: Determine next migration number**

```bash
cd /home/safturento/Repos/crew/.planning-worktrees/CREW-202
ls packages/daemon/src/migrations/ | sort | tail -1
```

If the last is `0007_…`, the new one is `0008_pr_merged_state.ts`.

- [ ] **Step 2: Write the migration**

The existing `state_transitions` table has CHECK constraints listing allowed values (per `0002_state_transitions.ts`). SQLite doesn't support `ALTER TABLE ... DROP CONSTRAINT`, so the migration recreates the table:

```ts
import { Kysely, sql } from 'kysely';
import type { DB } from '../db.js';

/**
 * 0008 adds `pr_merged` to the state_transitions CHECK constraint.
 * SQLite can't ALTER a CHECK, so we recreate the table preserving all rows.
 */
export async function up(db: Kysely<DB>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  await sql`
    CREATE TABLE state_transitions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT NOT NULL REFERENCES agents(key),
      from_state TEXT
        CHECK (from_state IN ('init','running','pr_open','pr_merged','error','finished','idle','waiting')),
      to_state TEXT NOT NULL
        CHECK (to_state IN ('init','running','pr_open','pr_merged','error','finished','idle','waiting')),
      ts INTEGER NOT NULL
    )
  `.execute(db);

  await sql`
    INSERT INTO state_transitions_new (id, agent_key, from_state, to_state, ts)
    SELECT id, agent_key, from_state, to_state, ts FROM state_transitions
  `.execute(db);

  await sql`DROP TABLE state_transitions`.execute(db);
  await sql`ALTER TABLE state_transitions_new RENAME TO state_transitions`.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS state_transitions_agent_ts ON state_transitions (agent_key, ts)
  `.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}

export async function down(db: Kysely<DB>): Promise<void> {
  // Down recreates the original CHECK without pr_merged. Rows with
  // to_state='pr_merged' would fail the check, so we drop them first.
  await sql`PRAGMA foreign_keys = OFF`.execute(db);
  await sql`DELETE FROM state_transitions WHERE to_state = 'pr_merged' OR from_state = 'pr_merged'`.execute(db);

  await sql`
    CREATE TABLE state_transitions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT NOT NULL REFERENCES agents(key),
      from_state TEXT
        CHECK (from_state IN ('init','running','pr_open','error','finished','idle','waiting')),
      to_state TEXT NOT NULL
        CHECK (to_state IN ('init','running','pr_open','error','finished','idle','waiting')),
      ts INTEGER NOT NULL
    )
  `.execute(db);

  await sql`
    INSERT INTO state_transitions_new (id, agent_key, from_state, to_state, ts)
    SELECT id, agent_key, from_state, to_state, ts FROM state_transitions
  `.execute(db);

  await sql`DROP TABLE state_transitions`.execute(db);
  await sql`ALTER TABLE state_transitions_new RENAME TO state_transitions`.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS state_transitions_agent_ts ON state_transitions (agent_key, ts)
  `.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}
```

- [ ] **Step 3: Update `db.ts` interface**

In `packages/daemon/src/db.ts`, find `StateTransitionsTable` and add `'pr_merged'` to both `from_state` and `to_state` union types:

```ts
export interface StateTransitionsTable {
  // ...
  from_state: 'init' | 'running' | 'pr_open' | 'pr_merged' | 'error' | 'finished' | 'idle' | 'waiting' | null;
  to_state:   'init' | 'running' | 'pr_open' | 'pr_merged' | 'error' | 'finished' | 'idle' | 'waiting';
  // ...
}
```

- [ ] **Step 4: Run migration tests**

```bash
cd /home/safturento/Repos/crew/.planning-worktrees/CREW-202
npm run test:run --workspace=crew-daemon -- migrations
```

Expected: new migration runs; existing migrations still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/migrations/0008_pr_merged_state.ts packages/daemon/src/db.ts
git commit -m "feat(daemon): migration + db type for pr_merged state (CREW-202)"
```

---

## Task 3: Daemon AgentState + IngestService + routes — type extensions

**Files:**
- Modify: `packages/daemon/src/services/AgentsService.ts` (line ~10 — `AgentState` type)
- Modify: `packages/daemon/src/services/IngestService.ts` (line ~395 — `isTransitionState` guard + the type union if redefined locally)
- Modify: `packages/daemon/src/routes/agents.ts` (line ~5 — `AgentStateEnum` Zod)

- [ ] **Step 1: Write failing tests**

In `IngestService.test.ts`, add:

```ts
it('isTransitionState recognizes pr_merged', () => {
  expect(isTransitionState('pr_merged')).toBe(true);
});
```

In `routes/agents.test.ts`, add a route test that asserts the response schema accepts `pr_merged`:

```ts
it('agent detail response validates state="pr_merged"', () => {
  // Seed an agent with a pr_merged transition; GET /api/agents/:key
  // Expect zod schema to accept the state without throwing.
});
```

- [ ] **Step 2: Run, verify fails**

```bash
npm run test:run --workspace=crew-daemon -- IngestService routes/agents
```

- [ ] **Step 3: Add `pr_merged` to all three call sites**

`AgentsService.ts:10`:
```ts
export type AgentState = 'initializing' | 'running' | 'pr_open' | 'pr_merged' | 'error' | 'finished';
```

`IngestService.ts:406`:
```ts
function isTransitionState(s: string | null | undefined): s is TransitionState {
  return s === 'init' || s === 'running' || s === 'pr_open' || s === 'pr_merged' || s === 'finished';
}
```

(Also extend the local `TransitionState` union near the top of the file if it's redeclared.)

`routes/agents.ts:5`:
```ts
const AgentStateEnum = z.enum(['initializing', 'running', 'pr_open', 'pr_merged', 'error', 'finished']);
```

- [ ] **Step 4: Re-run, verify pass**

```bash
npm run test:run --workspace=crew-daemon -- IngestService routes/agents
```

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/AgentsService.ts \
        packages/daemon/src/services/IngestService.ts \
        packages/daemon/src/routes/agents.ts
git commit -m "feat(daemon): pr_merged in AgentState, IngestService guard, AgentStateEnum (CREW-202)"
```

---

## Task 4: `fetchPrStateViaGh` helper + tests

**Files:**
- Create: `packages/daemon/src/services/github/fetch-pr-state.ts`
- Create: `packages/daemon/src/services/github/fetch-pr-state.test.ts`

- [ ] **Step 1: Write failing tests**

`fetch-pr-state.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import { fetchPrStateViaGh } from './fetch-pr-state.js';

describe('fetchPrStateViaGh', () => {
  it('returns MERGED when GitHub reports merged: true', async () => {
    vi.mocked(execa).mockResolvedValueOnce({ stdout: JSON.stringify({ state: 'MERGED', merged: true }) } as never);
    expect(await fetchPrStateViaGh('https://github.com/o/r/pull/1')).toBe('MERGED');
  });

  it('returns CLOSED when state=CLOSED and not merged', async () => {
    vi.mocked(execa).mockResolvedValueOnce({ stdout: JSON.stringify({ state: 'CLOSED', merged: false }) } as never);
    expect(await fetchPrStateViaGh('https://github.com/o/r/pull/2')).toBe('CLOSED');
  });

  it('returns OPEN when state=OPEN', async () => {
    vi.mocked(execa).mockResolvedValueOnce({ stdout: JSON.stringify({ state: 'OPEN', merged: false }) } as never);
    expect(await fetchPrStateViaGh('https://github.com/o/r/pull/3')).toBe('OPEN');
  });

  it('invokes `gh pr view <url> --json state,merged`', async () => {
    vi.mocked(execa).mockResolvedValueOnce({ stdout: JSON.stringify({ state: 'OPEN', merged: false }) } as never);
    await fetchPrStateViaGh('https://github.com/o/r/pull/5');
    expect(execa).toHaveBeenCalledWith('gh', ['pr', 'view', 'https://github.com/o/r/pull/5', '--json', 'state,merged']);
  });
});
```

- [ ] **Step 2: Run, verify fails**

```bash
npm run test:run --workspace=crew-daemon -- fetch-pr-state
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`fetch-pr-state.ts`:

```ts
import { execa } from 'execa';

export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

interface GhResponse {
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  merged: boolean;
}

/**
 * Query the GitHub PR's current state via `gh pr view`. Normalizes the
 * response: returns 'MERGED' when merged is true (regardless of state),
 * 'CLOSED' when state=CLOSED and not merged, 'OPEN' otherwise.
 *
 * Throws on `gh` failure (binary missing, auth, network) — caller catches
 * and logs per-agent without aborting the wider poll loop.
 */
export async function fetchPrStateViaGh(prUrl: string): Promise<PrState> {
  const { stdout } = await execa('gh', ['pr', 'view', prUrl, '--json', 'state,merged']);
  const parsed = JSON.parse(stdout) as GhResponse;
  if (parsed.merged) return 'MERGED';
  if (parsed.state === 'CLOSED') return 'CLOSED';
  return 'OPEN';
}
```

If `execa` isn't already a daemon dep, add it: `npm install execa --workspace=crew-daemon`. (It's likely already used elsewhere — check `packages/daemon/package.json` first.)

- [ ] **Step 4: Re-run, verify passes**

```bash
npm run test:run --workspace=crew-daemon -- fetch-pr-state
```

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/github/fetch-pr-state.ts \
        packages/daemon/src/services/github/fetch-pr-state.test.ts
# Also commit package.json + package-lock.json if execa was added
git commit -m "feat(daemon): fetchPrStateViaGh helper (CREW-202)

Wraps gh pr view <url> --json state,merged. Returns the normalized
PrState union ('OPEN' | 'MERGED' | 'CLOSED'). Caller is responsible
for catching gh failures (binary missing, auth, network)."
```

---

## Task 5: `PrPoller` service — `checkAgent` first (foundation for both polling + manual refresh)

**Files:**
- Create: `packages/daemon/src/services/PrPoller.ts`
- Create: `packages/daemon/src/services/PrPoller.test.ts`

- [ ] **Step 1: Write failing tests for `checkAgent`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Kysely } from 'kysely';
import { PrPoller } from './PrPoller.js';
import type { DB } from '../db.js';

vi.mock('./github/fetch-pr-state.js', () => ({
  fetchPrStateViaGh: vi.fn(),
}));
import { fetchPrStateViaGh } from './github/fetch-pr-state.js';

describe('PrPoller.checkAgent', () => {
  let db: Kysely<DB>;
  let eventBus: { publish: ReturnType<typeof vi.fn> };
  let logger: { warn: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
  let poller: PrPoller;

  beforeEach(async () => {
    db = await createTestDb();  // existing test helper that opens an in-memory SQLite + runs migrations
    eventBus = { publish: vi.fn() };
    logger = { warn: vi.fn(), debug: vi.fn() };
    poller = new PrPoller(db, eventBus as never, logger as never);
  });

  afterEach(() => { vi.clearAllMocks(); });

  it('transitions pr_open → pr_merged when PR is MERGED', async () => {
    await seedAgent(db, { key: 'AGENT', pr_url: 'https://github.com/o/r/pull/1', currentState: 'pr_open' });
    vi.mocked(fetchPrStateViaGh).mockResolvedValueOnce('MERGED');

    const result = await poller.checkAgent('AGENT');
    expect(result).toEqual({ stateChanged: true, newState: 'pr_merged' });

    const latest = await db.selectFrom('state_transitions').selectAll().where('agent_key', '=', 'AGENT').orderBy('id', 'desc').executeTakeFirst();
    expect(latest?.from_state).toBe('pr_open');
    expect(latest?.to_state).toBe('pr_merged');

    expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent.state_changed' }));
  });

  it('transitions pr_open → pr_merged when PR is CLOSED (single state covers both)', async () => {
    await seedAgent(db, { key: 'AGENT', pr_url: 'https://github.com/o/r/pull/2', currentState: 'pr_open' });
    vi.mocked(fetchPrStateViaGh).mockResolvedValueOnce('CLOSED');

    const result = await poller.checkAgent('AGENT');
    expect(result.stateChanged).toBe(true);
    expect(result.newState).toBe('pr_merged');
  });

  it('no-op when PR is still OPEN', async () => {
    await seedAgent(db, { key: 'AGENT', pr_url: 'https://github.com/o/r/pull/3', currentState: 'pr_open' });
    vi.mocked(fetchPrStateViaGh).mockResolvedValueOnce('OPEN');

    const result = await poller.checkAgent('AGENT');
    expect(result.stateChanged).toBe(false);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('no-op when agent has no pr_url', async () => {
    await seedAgent(db, { key: 'AGENT', pr_url: null, currentState: 'pr_open' });
    const result = await poller.checkAgent('AGENT');
    expect(result.stateChanged).toBe(false);
    expect(fetchPrStateViaGh).not.toHaveBeenCalled();
  });

  it('no-op when agent is not in pr_open state (precondition)', async () => {
    await seedAgent(db, { key: 'AGENT', pr_url: 'https://github.com/o/r/pull/4', currentState: 'pr_merged' });
    const result = await poller.checkAgent('AGENT');
    expect(result.stateChanged).toBe(false);
    expect(fetchPrStateViaGh).not.toHaveBeenCalled();
  });

  it('logs and returns no-op when gh throws', async () => {
    await seedAgent(db, { key: 'AGENT', pr_url: 'https://github.com/o/r/pull/5', currentState: 'pr_open' });
    vi.mocked(fetchPrStateViaGh).mockRejectedValueOnce(new Error('gh: command not found'));

    const result = await poller.checkAgent('AGENT');
    expect(result.stateChanged).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });
});
```

(`createTestDb`, `seedAgent` are existing test helpers in this package. Adapt to actual names.)

- [ ] **Step 2: Verify fails**

```bash
npm run test:run --workspace=crew-daemon -- PrPoller
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PrPoller.checkAgent`**

`PrPoller.ts`:

```ts
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { EventBus } from '../events/EventBus.js';  // existing
import type { DB } from '../db.js';
import { fetchPrStateViaGh } from './github/fetch-pr-state.js';
import type { AgentState } from './AgentsService.js';

export interface CheckResult {
  stateChanged: boolean;
  newState?: AgentState;
}

export class PrPoller {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Kysely<DB>,
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
    private readonly intervalMs = 5 * 60_000,
  ) {}

  start(): void {
    void this.pollOnce();  // kick off immediately so we don't wait 5min after boot
    this.timer = setInterval(() => {
      this.pollOnce().catch((err) => this.logger.warn({ err }, 'PR poll round failed'));
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Public — on-demand check for one agent (manual Refresh button). */
  async checkAgent(agentKey: string): Promise<CheckResult> {
    try {
      return await this.checkOneInternal(agentKey);
    } catch (err) {
      this.logger.warn({ err, agentKey }, 'PR check failed for agent');
      return { stateChanged: false };
    }
  }

  /** Internal — full check pipeline with all preconditions. Used by both poll + checkAgent. */
  private async checkOneInternal(agentKey: string): Promise<CheckResult> {
    const agent = await this.db
      .selectFrom('agents')
      .select(['key', 'pr_url'])
      .where('key', '=', agentKey)
      .executeTakeFirst();
    if (!agent?.pr_url) return { stateChanged: false };

    const currentState = await this.getCurrentState(agentKey);
    if (currentState !== 'pr_open') return { stateChanged: false };

    const prState = await fetchPrStateViaGh(agent.pr_url);
    if (prState === 'OPEN') return { stateChanged: false };

    // MERGED or CLOSED → transition to pr_merged
    const ts = Date.now();
    await this.db
      .insertInto('state_transitions')
      .values({ agent_key: agentKey, from_state: 'pr_open', to_state: 'pr_merged', ts })
      .execute();
    this.eventBus.publish({
      type: 'agent.state_changed',
      data: { key: agentKey, from: 'pr_open', to: 'pr_merged', ts },
    });
    return { stateChanged: true, newState: 'pr_merged' };
  }

  /** Read latest to_state from state_transitions; fall back to 'initializing'. */
  private async getCurrentState(agentKey: string): Promise<AgentState> {
    const latest = await this.db
      .selectFrom('state_transitions')
      .select('to_state')
      .where('agent_key', '=', agentKey)
      .orderBy('ts', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    return (latest?.to_state ?? 'initializing') as AgentState;
  }

  /** Iterate all pr_open agents with non-null pr_url; check each. */
  private async pollOnce(): Promise<void> {
    const agents = await this.db
      .selectFrom('agents as a')
      .innerJoin(
        (eb) =>
          eb
            .selectFrom('state_transitions as st')
            .select(['st.agent_key', eb.fn.max('st.ts').as('max_ts')])
            .groupBy('st.agent_key')
            .as('latest'),
        (join) => join.onRef('latest.agent_key', '=', 'a.key'),
      )
      .innerJoin('state_transitions as st2', (join) =>
        join.onRef('st2.agent_key', '=', 'latest.agent_key').onRef('st2.ts', '=', 'latest.max_ts'),
      )
      .where('st2.to_state', '=', 'pr_open')
      .where('a.pr_url', 'is not', null)
      .select(['a.key'])
      .execute();

    for (const agent of agents) {
      await this.checkAgent(agent.key);  // already wraps errors per-agent
    }
  }
}
```

(The `pollOnce` JOIN gymnastic mirrors AgentsService's existing "latest transition per agent" pattern — adapt to whatever helper exists there if cleaner.)

- [ ] **Step 4: Re-run, verify all `checkAgent` tests pass**

```bash
npm run test:run --workspace=crew-daemon -- PrPoller
```

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/PrPoller.ts \
        packages/daemon/src/services/PrPoller.test.ts
git commit -m "feat(daemon): PrPoller.checkAgent — pr_open → pr_merged on PR closure (CREW-202)

checkAgent reads the agent's pr_url + current state, queries GitHub
via fetchPrStateViaGh, fires the pr_open → pr_merged transition when
the PR is MERGED or CLOSED. Preconditions: agent must have pr_url AND
currently be in pr_open. gh failures are caught + logged, no-op return.

pollOnce iterates pr_open agents and calls checkAgent per row.
Wire-in to serve.ts in next task."
```

---

## Task 6: Wire `PrPoller` into `serve.ts` (start on boot, stop on shutdown)

**Files:**
- Modify: `packages/daemon/src/serve.ts` (or wherever existing services are wired — `agents.service` / `ingest.service` instantiation site)

- [ ] **Step 1: Locate the existing service-wiring site**

```bash
grep -rn "new IngestService\|new AgentsService\|fastify.register" packages/daemon/src --include='*.ts' | head -10
```

Note where IngestService is instantiated and started — PrPoller follows the same shape.

- [ ] **Step 2: Add PrPoller alongside**

```ts
import { PrPoller } from './services/PrPoller.js';

// inside the service-wiring block:
const prPoller = new PrPoller(db, eventBus, logger);
prPoller.start();

// inside the graceful-shutdown hook (find existing fastify.addHook('onClose') or similar):
fastify.addHook('onClose', async () => {
  prPoller.stop();
  // existing cleanup
});
```

If awilix DI is in use (per AGENTS.md), register PrPoller in the container instead of instantiating directly:

```ts
container.register({
  prPoller: asClass(PrPoller).singleton(),
});
container.resolve('prPoller').start();
```

- [ ] **Step 3: Smoke test**

Start the daemon locally:

```bash
cd packages/daemon
CREW_DB_FILE=/tmp/crew-test.db npm run dev
```

Watch the logs. Should see no "PR poll round failed" warnings (no pr_open agents in a fresh DB).

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/serve.ts
git commit -m "feat(daemon): wire PrPoller into service startup (CREW-202)"
```

---

## Task 7: New `POST /api/agents/:key/refresh-pr-status` route

**Files:**
- Modify: `packages/daemon/src/routes/agents.ts`
- Modify: `packages/daemon/src/routes/agents.test.ts`

- [ ] **Step 1: Write failing tests**

In `routes/agents.test.ts`:

```ts
describe('POST /api/agents/:key/refresh-pr-status', () => {
  it('returns {stateChanged: false} for an OPEN PR', async () => {
    // Seed a pr_open agent; mock fetchPrStateViaGh → OPEN
    const res = await app.inject({ method: 'POST', url: '/api/agents/AGENT/refresh-pr-status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ stateChanged: false });
  });

  it('returns {stateChanged: true, newState: "pr_merged"} when PR merged', async () => {
    // Seed pr_open + mock → MERGED
    const res = await app.inject({ method: 'POST', url: '/api/agents/AGENT/refresh-pr-status' });
    expect(res.json()).toEqual({ stateChanged: true, newState: 'pr_merged' });
  });

  it('404 for unknown agent', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/agents/UNKNOWN/refresh-pr-status' });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Verify fails**

```bash
npm run test:run --workspace=crew-daemon -- routes/agents
```

- [ ] **Step 3: Add the route**

In `routes/agents.ts`:

```ts
import { z } from 'zod';

// Route shape:
fastify.post(
  '/api/agents/:key/refresh-pr-status',
  {
    schema: {
      params: z.object({ key: z.string() }),
      response: {
        200: z.object({
          stateChanged: z.boolean(),
          newState: AgentStateEnum.optional(),
        }),
        404: z.object({ error: z.string() }),
      },
    },
  },
  async (req, reply) => {
    const agent = await fastify.diContainer.cradle.agentsService.getByKey(req.params.key);
    if (!agent) return reply.code(404).send({ error: 'agent_not_found' });

    const result = await fastify.diContainer.cradle.prPoller.checkAgent(req.params.key);
    return result;
  },
);
```

(Adapt to actual DI access pattern — awilix `diContainer.cradle.<name>` is the conventional crew style.)

- [ ] **Step 4: Re-run, verify passes**

```bash
npm run test:run --workspace=crew-daemon -- routes/agents
```

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/routes/agents.ts \
        packages/daemon/src/routes/agents.test.ts
git commit -m "feat(daemon): POST /api/agents/:key/refresh-pr-status (CREW-202)

Manual on-demand PR-status check, callable from the drawer's Refresh
button. Delegates to PrPoller.checkAgent which already wraps errors.
404 when agent unknown; otherwise returns {stateChanged, newState?}."
```

---

## Task 8: Daemon Dockerfile — install `gh` CLI

**Files:**
- Modify: `packages/daemon/Dockerfile`

- [ ] **Step 1: Add `gh` to the apt-get install line**

```dockerfile
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl gnupg \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*
```

(Replaces the existing `apt-get install curl` line. Keep `curl` since the existing healthcheck uses it.)

- [ ] **Step 2: Mount the host's gh auth into the daemon container**

In `docker-compose.yml`, add to the daemon service's `volumes`:

```yaml
- ${HOME}/.config/gh:/root/.config/gh:ro
```

This makes the host's authenticated `gh` token available inside the container without re-auth.

- [ ] **Step 3: Rebuild + restart the daemon**

```bash
docker compose stop daemon
docker compose rm -fv daemon
docker compose up -d --build daemon
```

(Per the `.agents/local-dev.md` recipe for adding a daemon dep.)

- [ ] **Step 4: Verify gh works inside the container**

```bash
docker compose exec daemon gh --version
docker compose exec daemon gh auth status
```

Both should succeed.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/Dockerfile docker-compose.yml
git commit -m "chore(daemon): install gh CLI in Dockerfile + mount host auth (CREW-202)

PrPoller (CREW-202) needs `gh pr view` to query PR state. Adds the
official gh apt repo + installs the CLI. docker-compose mounts the
host's ~/.config/gh read-only so the daemon inherits auth without
a re-login.

Post-merge: docker compose rm -fv daemon && docker compose up -d --build daemon."
```

---

## Task 9: Bruno smoke for the new route

**Files:**
- Create: `bruno/endpoints/agents/refresh-pr-status.bru`

- [ ] **Step 1: Add the request**

```
meta {
  name: Refresh PR Status
  type: http
  seq: 50
}

post {
  url: {{baseUrl}}/api/agents/{{seedAgentKey}}/refresh-pr-status
  body: none
  auth: none
}

tests {
  test("status 200", () => {
    expect(res.getStatus()).to.equal(200);
  });

  test("response shape", () => {
    const body = res.getBody();
    expect(body).to.have.property('stateChanged').that.is.a('boolean');
    if (body.stateChanged) {
      expect(body).to.have.property('newState');
    }
  });
}
```

(Adapt `seedAgentKey` to whatever the existing bruno collection uses for a known fixture agent.)

- [ ] **Step 2: Run smoke**

```bash
npm run bruno:smoke
```

Expected: all existing requests still pass; new one passes against the seeded fixture.

- [ ] **Step 3: Commit**

```bash
git add bruno/endpoints/agents/refresh-pr-status.bru
git commit -m "test(bruno): smoke for /api/agents/:key/refresh-pr-status (CREW-202)"
```

---

## Task 10: Dashboard — `STATE_META.pr_merged` + `STATE_CLASSES.pr_merged`

**Files:**
- Modify: `packages/dashboard/src/data/types.ts`
- Modify: `packages/dashboard/src/data/state-meta.ts`
- Modify: `packages/dashboard/src/data/state-meta.test.ts` (create if absent)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { STATE_META, STATE_CLASSES } from './state-meta.js';

describe('pr_merged', () => {
  it('STATE_META.pr_merged exists with label "PR merged"', () => {
    expect(STATE_META.pr_merged).toBeDefined();
    expect(STATE_META.pr_merged.label).toBe('PR merged');
    expect(STATE_META.pr_merged.attention).toBe(false);
  });

  it('STATE_CLASSES.pr_merged uses green family', () => {
    expect(STATE_CLASSES.pr_merged.text).toMatch(/green/);
    expect(STATE_CLASSES.pr_merged.solidBg).toMatch(/green/);
  });
});
```

- [ ] **Step 2: Run, verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- state-meta
```

- [ ] **Step 3: Add `pr_merged` to types + STATE_META + STATE_CLASSES**

`types.ts`:
```ts
export type AgentState = 'initializing' | 'running' | 'pr_open' | 'pr_merged' | 'waiting' | 'error' | 'idle' | 'finished';
// also extend TransitionState if separately declared
```

`state-meta.ts`:
```ts
// STATE_META
export const STATE_META: Record<AgentState, StateMetaEntry> = {
  // existing entries unchanged
  pr_merged: { label: 'PR merged', attention: false, sortRank: 2.5 },  // between pr_open (2) and running (3)
  // ...
};

// STATE_CLASSES — mirror the green shade used by `finished`
export const STATE_CLASSES: Record<AgentState, StateClassTokens> = {
  // existing entries unchanged
  pr_merged: {
    text: 'text-green-400',
    bg: 'bg-green-1050',
    border: 'border-green-500',
    solidBg: 'bg-green-400',
    solidBorder: 'border-green-400',
  },
  // ...
};

// transitionToAgentState — pass-through for 'pr_merged' (already same identifier)
const TRANSITION_TO_AGENT_STATE: Record<TransitionState, AgentState> = {
  // existing + new:
  pr_merged: 'pr_merged',
  // ...
};
```

If the green shade `green-1050` doesn't exist in the Tailwind theme, copy whatever `finished` uses for its `bg` darkest shade. The implementer verifies against `index.css` `@theme` block.

- [ ] **Step 4: Re-run, verify passes**

```bash
npm run test:run --workspace=crew-dashboard -- state-meta
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/data/types.ts \
        packages/dashboard/src/data/state-meta.ts \
        packages/dashboard/src/data/state-meta.test.ts
git commit -m "feat(dashboard): pr_merged state vocabulary + green/check visual (CREW-202)"
```

---

## Task 11: Dashboard — `refreshPrStatus` client helper + mutation hook

**Files:**
- Modify: `packages/dashboard/src/data/HttpDaemonClient.ts`
- Modify: `packages/dashboard/src/data/queries.ts`
- Modify: `packages/dashboard/src/data/HttpDaemonClient.test.ts`

- [ ] **Step 1: Write failing tests**

In `HttpDaemonClient.test.ts`:

```ts
it('refreshPrStatus POSTs to the right URL and returns the validated response', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({ stateChanged: true, newState: 'pr_merged' }));
  const client = new HttpDaemonClient('http://localhost:7773');
  const result = await client.refreshPrStatus('AGENT');
  expect(fetchMock).toHaveBeenCalledWith('http://localhost:7773/api/agents/AGENT/refresh-pr-status', expect.objectContaining({ method: 'POST' }));
  expect(result).toEqual({ stateChanged: true, newState: 'pr_merged' });
});
```

- [ ] **Step 2: Verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- HttpDaemonClient
```

- [ ] **Step 3: Implement `refreshPrStatus`**

In `HttpDaemonClient.ts`:

```ts
import { z } from 'zod';

const RefreshPrStatusResponseSchema = z.object({
  stateChanged: z.boolean(),
  newState: z.enum(['initializing', 'running', 'pr_open', 'pr_merged', 'waiting', 'error', 'idle', 'finished']).optional(),
});

async refreshPrStatus(key: string): Promise<z.infer<typeof RefreshPrStatusResponseSchema>> {
  const res = await fetch(`${this.baseUrl}/api/agents/${encodeURIComponent(key)}/refresh-pr-status`, { method: 'POST' });
  if (!res.ok) throw new Error(`POST /api/agents/${key}/refresh-pr-status: ${res.status}`);
  return RefreshPrStatusResponseSchema.parse(await res.json());
}
```

In `queries.ts`, add a React Query mutation hook:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useRefreshPrStatus(key: string) {
  const qc = useQueryClient();
  const client = useDaemonClient();
  return useMutation({
    mutationFn: () => client.refreshPrStatus(key),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agent', key] });
      void qc.invalidateQueries({ queryKey: ['agent', key, 'state-history'] });
      void qc.invalidateQueries({ queryKey: ['agents'] });  // list view too
    },
  });
}
```

- [ ] **Step 4: Re-run, verify passes**

```bash
npm run test:run --workspace=crew-dashboard -- HttpDaemonClient
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/data/HttpDaemonClient.ts \
        packages/dashboard/src/data/HttpDaemonClient.test.ts \
        packages/dashboard/src/data/queries.ts
git commit -m "feat(dashboard): refreshPrStatus client helper + useRefreshPrStatus mutation (CREW-202)"
```

---

## Task 12: AgentRow — `pr_merged` QuickActions case

**Files:**
- Modify: `packages/dashboard/src/components/AgentRow.tsx`
- Modify: `packages/dashboard/src/components/AgentRow.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it('renders "View merged PR" + "Finish" quick actions for pr_merged state', () => {
  render(
    <AgentRow
      agent={{ ...baseAgent, state: 'pr_merged', prUrl: 'https://example.com/pr/1' }}
      onSelect={() => {}}
    />,
  );
  expect(screen.getByRole('link', { name: /View merged PR/ })).toHaveAttribute(
    'href',
    'https://example.com/pr/1',
  );
  expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
});

it('View merged PR link uses lucide/git-merge icon (not git-pull-request)', () => {
  render(
    <AgentRow agent={{ ...baseAgent, state: 'pr_merged', prUrl: 'https://example.com/pr/1' }} onSelect={() => {}} />,
  );
  const link = screen.getByRole('link', { name: /View merged PR/ });
  // Lucide renders SVGs with class names matching the icon
  expect(link.querySelector('svg')?.classList.toString()).toMatch(/lucide-git-merge/);
});
```

- [ ] **Step 2: Verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- AgentRow
```

- [ ] **Step 3: Add the `pr_merged` case to `QuickActions`**

In `AgentRow.tsx`, find the `QuickActions` `switch` block (currently has cases for `idle`, `waiting`, `pr_open`, `error`) and add:

```tsx
import { GitMerge } from 'lucide-react';

// inside QuickActions switch:
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

(Same structure as the existing `pr_open` case, with `GitMerge` icon + reworded label.)

- [ ] **Step 4: Re-run, verify passes**

```bash
npm run test:run --workspace=crew-dashboard -- AgentRow
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/AgentRow.tsx \
        packages/dashboard/src/components/AgentRow.test.tsx
git commit -m "feat(dashboard): AgentRow pr_merged case — View merged PR + Finish (CREW-202)"
```

---

## Task 13: DrawerHeader — Refresh button (pr_open) + Merged PR wording (pr_merged)

**Files:**
- Modify: `packages/dashboard/src/components/DrawerHeader.tsx`
- Modify: `packages/dashboard/src/components/DrawerHeader.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
import { RefreshCw, GitMerge } from 'lucide-react';

it('shows Refresh PR button when state is pr_open', () => {
  render(<DrawerHeader detail={makeDetail({ state: 'pr_open', pr_url: 'https://example.com/pr/1' })} showCloseButton={false} showOpenAsPage={false} />);
  expect(screen.getByRole('button', { name: /refresh pr/i })).toBeInTheDocument();
});

it('hides Refresh PR button when state is pr_merged', () => {
  render(<DrawerHeader detail={makeDetail({ state: 'pr_merged', pr_url: 'https://example.com/pr/1' })} showCloseButton={false} showOpenAsPage={false} />);
  expect(screen.queryByRole('button', { name: /refresh pr/i })).not.toBeInTheDocument();
});

it('PR pill reads "Merged PR" with git-merge icon when state is pr_merged', () => {
  render(<DrawerHeader detail={makeDetail({ state: 'pr_merged', jira_url: 'https://jira/x' })} showCloseButton={false} showOpenAsPage={false} />);
  const pill = screen.getByRole('link', { name: /merged pr/i });
  expect(pill.querySelector('svg')?.classList.toString()).toMatch(/lucide-git-merge/);
});

it('clicking Refresh PR fires the mutation and invalidates queries', async () => {
  const user = userEvent.setup();
  // Mock the mutation hook
  const mutate = vi.fn();
  vi.mocked(useRefreshPrStatus).mockReturnValueOnce({ mutate, isPending: false } as never);
  render(<DrawerHeader detail={makeDetail({ state: 'pr_open' })} showCloseButton={false} showOpenAsPage={false} />);
  await user.click(screen.getByRole('button', { name: /refresh pr/i }));
  expect(mutate).toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- DrawerHeader
```

- [ ] **Step 3: Update DrawerHeader**

```tsx
import { RefreshCw, GitMerge } from 'lucide-react';
import { useRefreshPrStatus } from '../data/queries.js';

// Inside DrawerHeader component:
const refreshPr = useRefreshPrStatus(detail.key);

// Add the Refresh button to the top-right action cluster, only when pr_open:
{detail.state === 'pr_open' && detail.pr_url && (
  <Button
    color="idle"
    intensity="ghost"
    size="sm"
    icon={<RefreshCw aria-hidden className={refreshPr.isPending ? 'animate-spin' : undefined} />}
    onClick={() => refreshPr.mutate()}
    disabled={refreshPr.isPending}
    aria-label="Refresh PR status"
  >
    Refresh PR
  </Button>
)}

// In the existing PR pill (currently shows ticket_key for pr_open):
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

- [ ] **Step 4: Re-run, verify passes**

```bash
npm run test:run --workspace=crew-dashboard -- DrawerHeader
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/DrawerHeader.tsx \
        packages/dashboard/src/components/DrawerHeader.test.tsx
git commit -m "feat(dashboard): DrawerHeader Refresh PR button + Merged PR wording (CREW-202)

When pr_open: shows a Refresh PR ghost button that fires the
useRefreshPrStatus mutation. Icon spins while pending. When pr_merged:
PR pill reads \"Merged PR\" with lucide/git-merge icon."
```

---

## Task 14: Final verification + visual fidelity

- [ ] **Lint + typecheck + test:run + bruno**

```bash
cd /home/safturento/Repos/crew/.planning-worktrees/CREW-202
npm run lint
npm run typecheck
npm run test:run
npm run bruno:smoke
```

All green expected.

- [ ] **Manual smoke** with a real pr_open agent

1. Have an agent in `pr_open` (use a fixture or a real one).
2. Open the drawer — confirm the new Refresh PR button is visible.
3. Click Refresh PR — spinner shows briefly, no state change if the PR is still open.
4. Merge the PR on GitHub.
5. Click Refresh PR again — state transitions to `pr_merged`. StateBadge turns green, "View PR" rewords to "View merged PR" with the new icon, Finish button becomes actionable.
6. Wait 5 minutes without clicking Refresh — the poller's background round should detect a similarly merged PR for another agent.
7. Click Finish — agent transitions to `finished` (existing behavior, unchanged).

- [ ] **`visual-fidelity-check` skill** — re-run against the populated CREW-102 fixture (if it has a pr_open agent) to confirm the new state renders correctly.

PR title: `feat(daemon+dashboard): PR closure detection + pr_merged state (CREW-202)`
