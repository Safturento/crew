# Slice 1c — Agent drawer + push updates — design

> **Purpose of this document.** A scoped design spec for slice 1c of the dashboard-data work: build the agent detail drawer (and its full-page sibling), widen the transcript schema to model every JSONL event type, add a `state_transitions` table for ordered state history, and replace TanStack's `refetchInterval` polling with a Server-Sent Events stream from the daemon. Slice 1c is the slice that makes the dashboard feel alive — the "open the drawer on a running agent and watch tool calls stream in" moment.
>
> Read the prior slices first: [`2026-04-26-dashboard-ui-design.md`](./2026-04-26-dashboard-ui-design.md) (the UI blueprint, especially §5 on the drawer and §10 on prerequisite endpoints), [`2026-04-28-daemon-bootstrap-and-projects-endpoint-design.md`](./2026-04-28-daemon-bootstrap-and-projects-endpoint-design.md) (slice 1a — daemon stack), and [`2026-04-29-agents-data-end-to-end-design.md`](./2026-04-29-agents-data-end-to-end-design.md) (slice 1b — ingest, tool-call persistence, agents list). This spec assumes the slice 1b stack is shipped: Fastify + Awilix + Zod + Kysely + pino on the daemon, TanStack Query on the dashboard, the `runs` and `tool_calls` tables in SQLite, the `IngestService` writing rows from the chokidar-driven (well, `fs.open`-driven; see followups) tail of each agent's JSONL.

## 1. Overview

**Tech.** Unchanged from slice 1b on the daemon — Fastify, Awilix, Zod, Kysely, pino, Vitest. New runtime dependencies for slice 1c:

- Daemon: none beyond what's already there. SSE is implemented on top of Fastify's existing reply stream; no `fastify-sse` plugin.
- Dashboard: `@tanstack/react-virtual` (timeline virtualization for long transcripts).
- Shared: none.

**Scope.**

In scope for slice 1c:

1. Exhaustive `TranscriptEvent` Zod schema in `crew-shared` covering every empirically-observed JSONL event type (12 top-level discriminants + nested discriminants on `system.subtype`, `attachment.type`, and `assistant`/`user` `content[].type`; ~38 variants total). Unrecognized variants fall through to a tagged `unknown` variant rather than failing.
2. New SQLite migration `0002_state_transitions` with idempotent backfill.
3. Three new daemon read endpoints: `GET /api/agents/:key`, `GET /api/agents/:key/state-history`, `GET /api/agents/:key/timeline` (re-parses the JSONL on demand; full event array).
4. `GET /api/events` — SSE firehose with hybrid event vocabulary (typed deltas for state changes, invalidation pings for tool-call bursts) plus a small in-memory ring buffer for `last-event-id` replay.
5. `IngestService` extensions: write `state_transitions` rows when derived state flips, extract `pr_url` from `gh pr create` tool_results, publish SSE events at every write seam.
6. `crew finish` CLI registers/completes runs with the daemon (parity with CREW-52/53).
7. Dashboard: agent detail drawer at `/agent/:key` (slides over the list) and full-page route at `/agent/:key/full`, both backed by the same three queries. Drawer body = TokenTable + StateHistoryBar + Timeline (with filter chips, search, live-mode toggle, expand-on-click cards using JSONL re-parse). PR URL renders in the drawer header. List view gets a "Hide finished" toggle (browser-local).
8. Dashboard SSE consumer wired into TanStack Query — typed events patch cache directly, pings invalidate.

Explicitly out of scope (deferred to future slices):

- `idle` / `waiting` state derivation. The state palette and `STATE_META` keep both states defined; the daemon emits only the four hard states (`init`, `running`, `pr_open`, `error`, `finished`) plus `pr_open` and `finished` as derivable. Tuning inactivity heuristics in the abstract is brittle; we'll do it once the drawer is real and we can see whether the absence feels missing.
- Tree-aware drawer rendering using `parentUuid`. The shared schema preserves `uuid` and `parentUuid` on every event so the data is ready, but the visual treatment (tool_use ↔ tool_result pairing, subagent transcripts nesting under `Task` tool_uses) is its own conversation.
- `POST /api/jobs/{run,fix-pr,finish}` mutations. These should land as a coherent batch in a future "dashboard mutations" slice rather than landing alone.
- Projects CRUD (`POST/PATCH/DELETE /projects`), Jira ticket picker, `POST /attention/clear`. UI design §10 prerequisites for surfaces beyond the drawer.
- Performance optimization for very long transcripts (LRU cache on the parser side, server-side pagination of the timeline endpoint). The Q3 design choice is to re-parse on demand; if profiling later shows it hurts, an in-memory LRU is a drop-in upgrade.

## 2. Empirical schema basis

> **Project-specific:** The schema in §3 is grounded in a corpus walk of every JSONL transcript under `~/.claude/projects/` at design time (247 files). Counts below come from that walk; absolute numbers are illustrative — the _set_ of variants is the contract.

| Top-level `type`        |  Count | Notes                                                                          |
| ----------------------- | -----: | ------------------------------------------------------------------------------ |
| `assistant`             | 27,690 | `message.content[]`: `tool_use` (17,019), `thinking` (5,568), `text` (5,120)   |
| `user`                  | 18,877 | `message.content[]`: `tool_result` (17,016), bare-string (1,573), `text` (302) |
| `queue-operation`       | 11,703 | `enqueue` / `dequeue` of input prompts                                         |
| `attachment`            |  6,946 | 20 `attachment.type` sub-variants                                              |
| `last-prompt`           |  4,434 | (already modeled in slice 1b)                                                  |
| `permission-mode`       |  1,368 | `default` / `acceptEdits` / etc.                                               |
| `file-history-snapshot` |  1,295 | CC's internal undo bookkeeping                                                 |
| `system`                |  1,250 | 7 `system.subtype` sub-variants                                                |
| `pr-link`               |    851 | (already modeled in slice 1b)                                                  |
| `ai-title`              |    656 | AI-generated session title                                                     |
| `custom-title`          |     88 | user-set session title                                                         |
| `agent-name`            |     41 | session/agent label                                                            |

`system.subtype` (7): `turn_duration`, `stop_hook_summary`, `local_command`, `compact_boundary`, `bridge_status`, `api_error`, `away_summary`.

`attachment.type` (20): `hook_success`, `queued_command`, `todo_reminder`, `task_reminder`, `command_permissions`, `skill_listing`, `hook_additional_context`, `deferred_tools_delta`, `edited_text_file`, `hook_system_message`, `file`, `ultrathink_effort`, `date_change`, `plan_mode_exit`, `nested_memory`, `invoked_skills`, `plan_mode`, `hook_non_blocking_error`, `compact_file_reference`, `plan_mode_reentry`.

The slice 1b parser modeled four of the twelve top-level types and discarded the rest as noise. The slice 1c parser models everything: it's the foundation for "every piece of data from the JSONL available somewhere on the dashboard."

## 3. Shared transcript schema

> **Project-specific:** Lands in `packages/shared/src/transcripts/`.

### 3.1 Envelope

Every event the parser returns carries a base envelope (intersected onto each variant where the source line provides them — older fixtures may omit some):

```ts
interface BaseEnvelope {
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string; // ISO 8601
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  userType?: string;
  entrypoint?: string;
  version?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
}
```

`uuid` and `parentUuid` are first-class — they form the conversation tree CC threads through the JSONL. Every variant preserves them even when slice 1c doesn't surface them visually.

### 3.2 Discriminated union shape

```ts
export type TranscriptEvent =
  | AssistantEvent
  | UserEvent
  | QueueOperationEvent
  | AttachmentEvent
  | LastPromptEvent
  | PermissionModeEvent
  | FileHistorySnapshotEvent
  | SystemEvent
  | PrLinkEvent
  | AiTitleEvent
  | CustomTitleEvent
  | AgentNameEvent
  | UnknownEvent;
```

`AssistantEvent.message.content[]` is itself a discriminated union: `ToolUseContent | ThinkingContent | TextContent | UnknownContent`. Same for `UserEvent.message.content[]`: `ToolResultContent | TextContent | UnknownContent`, with the `content`-as-bare-string case lifted to a sibling on `UserEvent` itself (`content: string | Array<...>`).

`SystemEvent` discriminates on `subtype`; `AttachmentEvent` discriminates on `attachment.type`. Each sub-variant declares its known fields and uses Zod's `.passthrough()` so unknown fields land in the parsed object rather than being stripped — forward-compat with future CC additions.

`UnknownEvent` is the catch-all:

```ts
interface UnknownEvent extends BaseEnvelope {
  type: 'unknown';
  raw: unknown; // the decoded JSON before schema rejection
  reason: 'unknown_top_level' | 'unknown_subtype' | 'zod_failure';
}
```

### 3.3 Parser contract

```ts
function parseTranscriptLine(line: string): TranscriptEvent | null;
```

- Returns `null` only when `JSON.parse` itself fails (truncated line, invalid JSON). Logged once per run (the IngestService keeps a counter), not per line.
- Returns the `unknown` variant on any Zod failure or unrecognized discriminant. Never throws.
- Pure function; no I/O. Safe to call from any context.

### 3.4 File layout

```
packages/shared/src/transcripts/
├── types.ts          # the discriminated union + envelope + variant interfaces
├── schemas.ts        # Zod schemas (one per variant + the union)
├── parser.ts         # parseTranscriptLine + tests of the JSON.parse / safeParse flow
├── parser.test.ts    # fixture-based tests (one fixture per variant)
├── fixtures/         # one .jsonl line per variant, sanitized
└── index.ts          # barrel
```

Existing slice 1b consumers (`tail.ts`, `IngestService`'s tool-call helpers) continue to work — the `AssistantEvent` shape is a strict superset of the slice 1b version.

## 4. Daemon: data model changes

### 4.1 New table — `state_transitions`

Migration `packages/daemon/src/migrations/0002_state_transitions.ts`:

```sql
CREATE TABLE state_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_key TEXT NOT NULL,
  from_state TEXT,                  -- NULL on the first transition for an agent
  to_state TEXT NOT NULL,
  ts INTEGER NOT NULL,              -- ms since epoch
  CHECK (to_state IN ('init','running','pr_open','error','finished','idle','waiting'))
);
CREATE INDEX state_transitions_agent_ts ON state_transitions (agent_key, ts);
```

`idle` and `waiting` are included in the CHECK list now even though slice 1c doesn't emit them — same forward-compat reasoning slice 1b applied to `runs.command`.

### 4.2 Backfill

The migration runs a one-time backfill before returning:

1. Select every distinct `agent_key` in `runs`.
2. For each agent, walk its `tool_calls` rows in order, applying the existing slice 1b state-derivation rules incrementally to compute the trail of state flips.
3. Insert one `state_transitions` row per flip.
4. Wrap each agent's backfill in a single transaction. If one agent's backfill fails, log + skip that agent — don't roll back the migration.

Idempotent because the table is empty pre-migration; re-running just refills.

### 4.3 IngestService extensions

`IngestService.handleEvent` (or the equivalent slice 1b seam) now does three additional things on every assistant `tool_use` event:

1. **State transition.** Re-derive the agent's state from the post-write tool-call totals. If different from the previous derived state (cached in memory per agent), insert a `state_transitions` row and publish an `agent.state_changed` SSE event.
2. **PR URL extraction.** When the tool name is `Bash` and the input string contains `gh pr create`, scan the corresponding `tool_result` event (looked up by `tool_use_id`) for the regex `https?://github\.com/[^/\s]+/[^/\s]+/pull/\d+`. On match, write the URL to `runs.pr_url`. On miss, leave it NULL — state derivation still flips to `pr_open` based purely on the tool-call detection.
3. **Tool-call ping.** Publish a `tool_calls.changed { agent_key }` SSE event after the row is written.

Slice 1b's existing tool-call ingestion path is unchanged otherwise. The summary string the dashboard's agents list renders is still the same.

### 4.4 EventBus

New service `packages/daemon/src/services/EventBus.ts`. In-process pub/sub, one Awilix-registered singleton. API:

```ts
class EventBus {
  publish(event: SseEvent): void; // assigns id, appends to ring buffer
  subscribe(opts: { lastEventId?: string; onEvent: (e: SseEvent) => void }): Unsubscribe;
}

type SseEvent =
  | {
      type: 'agent.state_changed';
      data: { key: string; from: string | null; to: string; ts: number };
      id: string;
    }
  | { type: 'tool_calls.changed'; data: { key: string }; id: string }
  | { type: 'run.completed'; data: { key: string; ts: number }; id: string }
  | { type: 'cache.miss'; data: {}; id: string }; // synthetic — see §5.4
```

Ring buffer holds the last ~1000 events (configurable via env, but fine to leave hardcoded for slice 1c). Older events are evicted; `subscribe({ lastEventId: <evicted-id> })` immediately yields a synthetic `cache.miss` event before any new live events.

## 5. Daemon: HTTP surface

### 5.1 `GET /api/agents/:key`

Single-agent detail. Joins `runs` + `tool_calls` aggregates + latest state transition.

```ts
type AgentDetail = {
  key: string;
  project: string;
  ticket_key: string;
  ticket_title: string | null;
  state: AgentState;
  worktree_path: string;
  pr_url: string | null;
  runs: Array<{
    id: string;
    command: 'run' | 'fix-pr' | 'finish';
    started_at: number;
    completed_at: number | null;
  }>;
  tokens: {
    total: number;
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
  };
  tool_call_count: number;
};
```

404 when no run exists with that key; otherwise 200.

### 5.2 `GET /api/agents/:key/state-history`

Returns the ordered transitions:

```ts
type StateHistoryResponse = {
  transitions: Array<{ from: string | null; to: string; ts: number }>;
};
```

### 5.3 `GET /api/agents/:key/timeline`

The big one. Re-parses the agent's JSONL on demand and returns the full array of parsed `TranscriptEvent`s. Implemented in a new `TimelineService`:

```ts
class TimelineService {
  async getTimeline(agentKey: string): Promise<{ events: TranscriptEvent[]; warnings: string[] }>;
}
```

Resolves the JSONL path via the existing slice 1b helper (`claudeProjectDirFor`), streams the file line-by-line, calls `parseTranscriptLine` on each, returns the array.

Failure modes:

- File missing → 200 with `events: []` and the response carries `X-Crew-Warning: transcript-missing`. Don't 404 — the agent record is still real.
- Malformed JSON line → skipped silently in the event array; counter logged on the daemon side.
- Zod failure → an `unknown` variant lands in the array. The dashboard renders it.

No pagination. Long transcripts ship as one array; the dashboard virtualizes the render.

### 5.4 `GET /api/events` (SSE)

Server-Sent Events, single firehose. Standard SSE framing:

```
id: <eventId>
event: agent.state_changed
data: {"key":"KAN-23","from":"running","to":"pr_open","ts":1730800000000}

id: <eventId>
event: tool_calls.changed
data: {"key":"KAN-23"}

```

- `event:` field corresponds to the `type` discriminant.
- `id:` field is what the client sends back as `last-event-id` on reconnect.
- On connect with a `last-event-id` header, the daemon flushes any buffered events newer than that id; if the id has been evicted, it sends a single synthetic `cache.miss` event before any live events. The dashboard treats `cache.miss` as "your cache is potentially stale; refetch everything you care about."
- No ping/heartbeat in slice 1c — the browser's `EventSource` reconnect handles transient disconnects, and we're localhost so we're not fighting load balancers.

### 5.5 Existing endpoints

`GET /api/agents` (slice 1b) is unchanged. The agents-list query continues to refetch via TanStack as before; SSE pings can also invalidate it for snappier list updates, but the polling fallback stays in place as a safety net (see §7.2).

## 6. CLI: `crew finish` daemon parity

> **Project-specific:** Mirrors the patterns in `packages/cli/src/commands/run.ts` (CREW-52) and `fix-pr.ts` (CREW-53).

`packages/cli/src/commands/finish.ts` adds two daemon round-trips:

1. **At start, before the merge:** `daemonClient.registerFinishRun(agentKey)`. Returns a `runId`. Daemon writes a `runs` row with `command='finish'`, `started_at=now`, `completed_at=NULL`, and publishes nothing yet (the run is just a tracked entity).
2. **At completion (success or failure):** `daemonClient.completeFinishRun(runId, { ok, error? })`. Daemon updates the row (sets `completed_at`), and — if `ok` — publishes `run.completed { key, ts }` via the EventBus. The state derivation then flips the agent to `finished` (separate path through the existing tool-call/state machinery; the finish run itself doesn't write tool_calls).

If the daemon is unreachable at either seam, the CLI logs a warning and proceeds with the local merge anyway. Same posture as slice-1b CLI registration. Daemon never blocks the CLI.

## 7. Dashboard

### 7.1 Routes

- `/` — agents list (existing). Adds a "Hide finished" toggle.
- `/agent/:key` — drawer slides over the list. Three queries fire in parallel: `useAgent(key)`, `useStateHistory(key)`, `useTimeline(key)`. Closing the drawer (Esc, click-outside, browser back, close button) navigates to `/`.
- `/agent/:key/full` — same data, full-page layout. Same components reused; the wrapper just isn't a drawer.
- `/projects` — out of scope for slice 1c (lands when projects CRUD is built).

### 7.2 SSE consumer

`packages/dashboard/src/data/eventStream.ts` — singleton wrapper around `EventSource`. Lifecycle:

1. Opens on dashboard mount, persists across route changes.
2. Reconnect with exponential backoff (cap 30s) on disconnect.
3. Sends `last-event-id` on reconnect.
4. On `cache.miss`, calls `queryClient.refetchQueries()` for the active queries (agents list + currently mounted drawer, if any).
5. On typed events, dispatches to per-type handlers:
   - `agent.state_changed` → `queryClient.setQueryData(['agent', key], patch)` and append to state-history cache.
   - `tool_calls.changed` → `queryClient.invalidateQueries(['agent', key, 'timeline'])` (TanStack debounces refetches naturally).
   - `run.completed` → `queryClient.invalidateQueries(['agents'])` and `['agent', key]`.

A polling-fallback `refetchInterval` stays configured on `useAgents` and the drawer queries — 30s when SSE is connected, 5s when disconnected. Belt-and-suspenders against missed publishes (see §8.5).

### 7.3 Drawer components

> **Project-specific:** New components live under `packages/dashboard/src/components/Timeline/` and `packages/dashboard/src/routes/`.

```
packages/dashboard/src/
├── routes/
│   ├── AgentDrawer.tsx       # /agent/:key
│   └── AgentFullPage.tsx     # /agent/:key/full
├── components/
│   ├── StateHistoryBar.tsx   # §5b
│   ├── TokenTable.tsx        # §5a
│   └── Timeline/
│       ├── Timeline.tsx       # §5c container — virtualized list, search, live-mode toggle
│       ├── FilterChips.tsx    # six chip groups (see §7.4)
│       ├── EventCard.tsx      # switches on event.type, delegates to renderer
│       └── renderers/
│           ├── ToolUseCard.tsx
│           ├── ThinkingCard.tsx
│           ├── TextCard.tsx        # assistant text + user text + bare-string user
│           ├── ToolResultCard.tsx
│           ├── SystemCard.tsx      # discriminates on system.subtype
│           ├── AttachmentCard.tsx  # discriminates on attachment.type
│           └── RawCard.tsx         # fallback for 'unknown' variant
```

Each renderer outputs the §5c card anatomy: line 1 = type-specific one-liner, line 2 = timestamp + token cost (when available). Click-to-expand swaps in the type-specific full view (Edits/Writes show diff-style content; Bash shows full command + truncated output; thinking shows full prose; etc.).

### 7.4 Filter chip groups

Six chips above the timeline. Defaults are curated for "tell the story without noise":

| Chip            | Default | Variants                                                                                                                                                                                                                                                                                                             |
| --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool calls      | ON      | `assistant.tool_use`, `user.tool_result`                                                                                                                                                                                                                                                                             |
| Assistant prose | ON      | `assistant.text`                                                                                                                                                                                                                                                                                                     |
| Thinking        | OFF     | `assistant.thinking`                                                                                                                                                                                                                                                                                                 |
| System          | OFF     | `system.*` (all 7 subtypes)                                                                                                                                                                                                                                                                                          |
| Hooks & skills  | OFF     | `attachment.{hook_success, hook_additional_context, hook_system_message, hook_non_blocking_error, skill_listing, invoked_skills, command_permissions, deferred_tools_delta}`                                                                                                                                         |
| Other           | OFF     | `attachment.{plan_mode*, todo_reminder, task_reminder, file, edited_text_file, ultrathink_effort, date_change, nested_memory, queued_command, compact_file_reference}`, `queue-operation`, `permission-mode`, `file-history-snapshot`, `ai-title`, `custom-title`, `agent-name`, `pr-link`, `last-prompt`, `unknown` |

All-off state shows an empty timeline body with copy "No events match your filters" and a "Show all" link that resets to the default-on set.

### 7.5 Search

Search input above the chips. Filters the _currently visible_ event set by substring against the type-specific one-liner content (tool name + input summary, assistant text, system message, etc.). Doesn't reach into expanded full content — that's a §5c future enhancement.

### 7.6 Live-mode toggle

When ON (default for active agents — i.e., agents not in `finished` or `error`): timeline pins to the bottom and auto-scrolls as SSE-driven cache invalidations land new events. When OFF: free-scroll; a "↓ N new events" pill appears in the bottom-right when new events arrive while scrolled away.

### 7.7 "Hide finished" toggle on the list

`AgentsList.tsx` gets a small toggle in its header. Default ON. Pref persisted to `localStorage` under `crew.dashboard.hideFinished`. Pure client-side filter — the agents list endpoint is unchanged; the dashboard just hides rows where `state === 'finished'`.

## 8. Failure modes & error handling

### 8.1 Transcript parsing

- `JSON.parse` failure → `parseTranscriptLine` returns `null`. IngestService keeps a counter; logs once per run when the run completes.
- Zod failure → returns `{ type: 'unknown', raw, reason: 'zod_failure' }`. Never thrown.
- Unrecognized top-level type → returns `{ type: 'unknown', raw, reason: 'unknown_top_level' }`.
- Unrecognized subtype on `system` or `attachment` → still parses into a `SystemEvent` / `AttachmentEvent` (the Zod schema for those types uses `.passthrough()`); the dashboard renders the known fields and pretty-prints the rest.

### 8.2 JSONL file missing or unreadable

`TimelineService.getTimeline` resolves the JSONL path via existing logic; if the file is missing (run record exists but transcript was deleted), returns 200 with `events: []` plus an `X-Crew-Warning: transcript-missing` header. Drawer renders an empty timeline with a small banner "Transcript file is missing." Don't 404 — the agent record is still real.

### 8.3 State-transition backfill

The 0002 migration's backfill walks every existing agent's tool_calls in batches. Wrap each agent's backfill in a single transaction; if one agent fails, log + skip — don't roll back the whole migration. Logged at WARN level with the agent key for manual recovery.

### 8.4 SSE reconnect / replay

- Browser `EventSource` auto-reconnects; the dashboard wrapper adds exponential backoff (cap 30s) for daemon-down scenarios.
- On reconnect, `last-event-id` is sent.
- If the daemon's ring buffer no longer holds it, the daemon emits a synthetic `cache.miss` event before any live events. The dashboard refetches all active queries on receipt.
- No silent data loss.

### 8.5 SSE event publish gap

If `IngestService` writes the DB row but crashes before publishing the SSE event, the dashboard misses the push. The polling-fallback `refetchInterval` (30s when SSE is connected) closes the gap. State eventually consistent within 30s in the worst case. We don't go to two-phase commit for this — overkill for a localhost dev tool.

### 8.6 `gh pr create` URL extraction failure

Zero regex matches in the tool_result content (e.g., the PR creation actually failed and stdout shows an error) → `runs.pr_url` stays NULL. State derivation still flips to `pr_open` based purely on tool-call detection — same behavior as slice 1b. Logged at debug level so the false-positive rate is observable.

### 8.7 `crew finish` registration failure

If the daemon is unreachable when `crew finish` starts, the CLI logs a warning and proceeds with the local merge anyway. Same behavior as `crew run` and `crew fix-pr` already exhibit per CREW-52/53.

### 8.8 Filter chips with empty results

When all visible chips produce zero events, the timeline shows an empty state with a "Show all" link that resets to the default-on chip set.

### 8.9 Long timelines

Slice 1c does not paginate. The timeline endpoint returns the full event array; the dashboard renders all cards via `@tanstack/react-virtual` so a 10k-event transcript doesn't blow out DOM nodes. If a real transcript exceeds practical limits, a slice 1d optimization (server pagination + cursor-based timeline endpoint) lands then.

## 9. Testing strategy

### 9.1 `crew-shared/transcripts/parser.test.ts`

Fixture-driven. One `fixtures/<variant>.jsonl` per discriminated variant — the ~38 sub-variants. Each fixture is a real (sanitized) line lifted from the corpus. Per-variant test asserts `parseTranscriptLine(fixture)` returns the expected shape with all envelope fields preserved.

Negative tests:

- Malformed JSON → returns `null`.
- Valid JSON with unknown `type` → returns `{ type: 'unknown', raw, reason: 'unknown_top_level' }`.
- Valid JSON with known `type` but invalid sub-shape → returns the appropriate `unknown` variant.

Golden test: parses a full real transcript end-to-end and asserts the histogram of variants matches expected counts. Guards against silent regressions when CC adds new top-level types.

### 9.2 Daemon

- `services/IngestService.test.ts` — extend with: state-transition row written on each derived flip; `pr_url` extracted from a `gh pr create` tool_result fixture; SSE event published on each write seam (mock `EventBus`).
- `services/EventBus.test.ts` (NEW) — pub/sub correctness, ring-buffer eviction at the cap, `subscribe(lastEventId)` replays only events after that id, replay returns a `cache.miss` sentinel when the id has been evicted.
- `services/TimelineService.test.ts` (NEW) — given a JSONL fixture, returns the parsed event array. Missing-file case returns `[]` + warning header.
- `routes/agents.test.ts` — extend with happy-path tests for the three new endpoints; integration-style against an in-memory SQLite + a temp JSONL fixture.
- `routes/events.test.ts` (NEW) — supertest against the SSE endpoint: assert event framing format, `last-event-id` triggers replay, ring-buffer overrun emits `cache.miss`.
- `migrations/0002_state_transitions.test.ts` (NEW) — given a seeded DB at slice-1b schema with N agents and tool_calls, run the migration, assert backfilled trail matches per-agent expected sequences. Idempotency: run twice, second is a no-op.

### 9.3 Dashboard

- `data/eventStream.test.ts` (NEW) — mocked `EventSource`; reconnect backoff, `last-event-id` on reconnect, `cache.miss` triggers full refetch.
- `data/queries.test.ts` — extend with the three new hooks; SSE state events patch cache directly, tool-call pings invalidate.
- `components/Timeline/Timeline.test.tsx` (NEW) — render with fixture timeline, filter chips toggle which event-type cards appear, search filters, "Show all" resets defaults, virtualized list renders only visible cards.
- `components/Timeline/renderers/*.test.tsx` — one per renderer file. Type-specific assertions (a `ToolUseCard` for a `Bash` event shows the command summary; clicking expands to show full input).
- `components/StateHistoryBar.test.tsx` (NEW) — given a transitions fixture, asserts ordered render; click-on-transition emits the scroll-to-segment callback.
- `components/AgentsList.test.tsx` — extend with the "Hide finished" toggle: ON hides finished agents, OFF reveals them, pref persists in localStorage.

### 9.4 Bruno

> **Project-specific:** Per the `bruno-collection-maintenance` skill, every new HTTP route ships with a matching `.bru` file in the same commit.

- `bruno/endpoints/agents/get-agent-by-key.bru`
- `bruno/endpoints/agents/get-state-history.bru`
- `bruno/endpoints/agents/get-timeline.bru`
- `bruno/endpoints/events/sse-stream.bru` (best-effort; bruno's SSE support is limited — a single connection-and-first-event assertion is enough)
- `bruno/flows/main-smoke.bru` — extend with a "drawer-data" stanza that hits the three drawer endpoints in sequence, asserts shape.

### 9.5 Playwright E2E

`tests/e2e/agent-drawer.spec.ts` (NEW). At minimum:

1. **Drawer opens.** Navigate to dashboard with a fixture-seeded agent, click the row, assert drawer mounts at `/agent/:key`, assert TokenTable + StateHistoryBar + Timeline all render with content.
2. **Filter chip behavior.** Toggle each chip in turn, assert event-type cards appear/disappear from the DOM (not just visibility).
3. **Empty filter state.** Click each chip until all are off. Assert: timeline body shows empty-state copy, "Show all" link is visible, _no_ event cards in the DOM. Click "Show all"; assert chips reset to defaults, cards reappear, search input is unchanged.
4. **Full-page route.** Navigate to `/agent/:key/full`; assert the same data renders with the page (not drawer) layout.
5. **State flip without refresh.** Use a test hook to publish a synthetic `agent.state_changed` event; assert the badge color in the drawer header flips without a page refresh.

### 9.6 Manual safety net (out-of-band)

Standalone script `packages/daemon/scripts/verify-state-transitions.ts` walks every `state_transitions` row and re-derives the trail from tool_calls, asserting they match. Not part of CI — a manual sanity check you can run after the migration in dev. Lift to a follow-up if it earns its own ticket; otherwise it lives as a one-shot file in the repo.

## 10. Sequencing & ticketing notes

> **Project-specific:** Following the planning-workflow convention, slice 1c becomes one Jira Epic with child tickets bundling logical groupings of plan tasks. The actual ticket breakdown lands in the writing-plans phase; this section just lists the natural groupings the plan should hit.

Suggested logical groupings (writing-plans will refine):

1. **Schema foundations.** Exhaustive `TranscriptEvent` Zod schema in `crew-shared`, fixtures, parser tests. Mirrors slice 1b's first ticket — small, low-risk, unblocks daemon and dashboard work.
2. **State transitions table + backfill.** Migration, IngestService extension to write transitions, tests.
3. **EventBus + SSE endpoint.** New service, ring buffer, `GET /api/events`, replay tests.
4. **Detail + state-history endpoints.** `GET /api/agents/:key`, `GET /api/agents/:key/state-history`.
5. **Timeline endpoint.** `TimelineService`, `GET /api/agents/:key/timeline`, missing-file handling.
6. **PR URL extraction.** IngestService extension, regex helper, tests.
7. **`crew finish` daemon registration.** CLI extension matching CREW-52/53.
8. **Dashboard SSE consumer.** `eventStream.ts`, cache integration, polling fallback.
9. **Drawer + full-page route.** Routes, three drawer queries, TokenTable, StateHistoryBar, Timeline shell.
10. **Timeline renderers.** Per-event-type cards under `Timeline/renderers/`, FilterChips, search, live-mode toggle, virtualization.
11. **List "Hide finished" toggle.** Trivially-sized ticket.
12. **E2E + Bruno coverage.** Playwright spec, `.bru` files, main-smoke flow extension.

Dependency edges that matter:

- 1 blocks 5 (timeline endpoint imports the schema).
- 2 blocks 4 (state-history endpoint reads the new table).
- 3 blocks 8 (no SSE consumer without an SSE endpoint).
- 8 blocks 10 (live-mode toggle wants real push-driven invalidation to be meaningful).
- 9 blocks 10, 11, 12.

Tickets 1, 2, 3, 6, 7 can run in parallel — they're independent surfaces.

## 11. Followups from this spec

- **Tree-aware rendering** using `parentUuid`. Data lands in slice 1c; visual treatment is its own conversation.
- **`idle` / `waiting` derivation.** Re-evaluate once the drawer is live. Likely a small follow-up ticket adding an inactivity heuristic + corresponding `state_transitions` row writes.
- **Performance for very long transcripts.** LRU cache on the parser side, server-side pagination of the timeline endpoint. Slice 1d candidate if profiling shows it.
- **`POST /api/jobs/{run,fix-pr,finish}` mutations.** Lands as a coherent batch in a future "dashboard mutations" slice.
- **Manual verify script promotion.** If `verify-state-transitions.ts` proves useful, lift it into CI as a periodic integrity check.
- **Renderer polish.** The slice 1c renderers are functional-first. Future iterations can add diff highlighting on Edit/Write, syntax-highlighting on code, collapsible long Bash output, etc.

These are deferred-but-named so they don't evaporate. Each becomes its own followup entry in `docs/followups.md` once the slice 1c epic is open.
