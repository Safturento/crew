# CREW-201 — Capture CLI startup phases in the Starting section

**Ticket:** [CREW-201](https://safturento.atlassian.net/browse/CREW-201) (to be filed)
**Epic:** [CREW-200 — Agent lifecycle observability](https://safturento.atlassian.net/browse/CREW-200)
**Date:** 2026-05-23

## Goal

Surface the `crew run` / `crew fix-pr` CLI's pre-agent startup work (worktree creation, npm install, docker bringup, MCP wiring, Claude spawn) as rows in the drawer Timeline's "Starting" section. The most painful current case: a dispatch hangs or errors at one of these steps, the dashboard shows "initializing" with nothing in the drawer, and the user has to grep `/tmp/crew-*.log` to find out what went wrong.

## Non-goals

- **Real-time line-by-line streaming.** Phase-grain ("npm install started" → "npm install completed") is enough for the dashboard. Full logs stay in `/tmp/crew-*.log`; rows link out.
- **Re-implementing the existing log files.** Those stay where they are. Startup events ADD a parallel structured stream for daemon ingestion.
- **Telemetry / metrics.** Phases get rendered; no aggregation, no histograms.
- **Capturing every CLI subcommand's startup.** Limit to dispatch-initiating commands: `crew run`, `crew fix-pr`, `crew finish` (which also brings down stacks). Other commands stay quiet.

## Design (brainstormed 2026-05-23)

| Q | Decision |
|---|---|
| Transport | CLI writes structured JSONL events to `~/.crew/startup/<key>.jsonl`. Daemon's IngestService gains a chokidar watcher for that dir. Consistent with the existing transcript-watching pattern. |
| Event grain | Per-phase events (not per-line). One event when a phase starts; one event when it finishes (success or fail) with a `summary` + optional `logPath` pointing at the existing /tmp log for deep-dive. |
| Frontend rendering | Use the existing TranscriptRow `system` event handling. Add per-phase label entries to `event-labels.ts` (CREW-190). Failed phases get the existing red `tone: 'error'` treatment. |
| Storage | New `startup_events` SQLite table in the daemon. Timeline endpoint merges with transcript events by timestamp. |

## Architecture

### Event shape

```ts
// shared/src/types.ts — new event variant
export interface StartupEvent {
  type: 'system';
  subtype:
    | 'crew_startup_worktree'
    | 'crew_startup_npm_install'
    | 'crew_startup_docker'
    | 'crew_startup_mcp'
    | 'crew_startup_claude_spawn';
  status: 'started' | 'completed' | 'failed';
  timestamp: string;       // ISO 8601
  summary: string;         // short human-readable: "Worktree created at /home/.../crew-CREW-201" or "npm install failed (exit 1)"
  durationMs?: number;     // set on completed/failed
  logPath?: string;        // /tmp/crew-*.log for the failing phase — drawer row links out
}
```

JSONL writer in CLI:

```ts
// packages/cli/src/lib/startup-events/writer.ts (new)
const FILE = (key: string) => path.join(os.homedir(), '.crew', 'startup', `${key}.jsonl`);

export async function emitStartupEvent(key: string, event: StartupEvent): Promise<void> {
  await fs.mkdir(path.dirname(FILE(key)), { recursive: true });
  await fs.appendFile(FILE(key), JSON.stringify(event) + '\n');
}
```

### CLI wiring — one writer call per phase boundary

Each existing dispatch phase brackets its work with `emitStartupEvent`:

```ts
// inside packages/cli/src/lib/run/bringup.ts (or wherever each phase lives)
await emitStartupEvent(key, { type: 'system', subtype: 'crew_startup_npm_install', status: 'started', timestamp: nowIso(), summary: 'npm ci begun' });
try {
  await runNpmCi();
  await emitStartupEvent(key, { type: 'system', subtype: 'crew_startup_npm_install', status: 'completed', timestamp: nowIso(), summary: 'installed N packages', durationMs });
} catch (err) {
  await emitStartupEvent(key, { type: 'system', subtype: 'crew_startup_npm_install', status: 'failed', timestamp: nowIso(), summary: `${err.message}`, logPath: '/tmp/crew-npm-install-' + key + '.log' });
  throw err;  // unchanged failure semantics
}
```

Phases to instrument (in order):
1. `crew_startup_worktree` — worktree creation (`git worktree add`)
2. `crew_startup_npm_install` — `npm ci` in the worktree
3. `crew_startup_docker` — `docker compose up --build --wait` for the worktree stack
4. `crew_startup_mcp` — MCP config write + chrome/etc. wiring
5. `crew_startup_claude_spawn` — `claude` subprocess spawn (last phase; transitions to the agent's own transcript stream)

The CLI already produces logs at `/tmp/crew-*-<key>.log` for steps 2-4; logPath references those.

### Daemon ingest

New chokidar watcher in `IngestService`:

```ts
// IngestService.ts additions
private watchStartupEvents(): void {
  const startupDir = path.join(os.homedir(), '.crew', 'startup');
  fs.mkdirSync(startupDir, { recursive: true });
  this.startupWatcher = chokidar.watch(`${startupDir}/*.jsonl`, { /* ... */ });
  this.startupWatcher.on('add', this.onStartupFile.bind(this));
  this.startupWatcher.on('change', this.onStartupFile.bind(this));
}

private async onStartupFile(filePath: string): Promise<void> {
  const agentKey = path.basename(filePath, '.jsonl');
  // Tail-and-parse: read from last-known offset, parse each new line as StartupEvent
  const events = await this.tailAndParse(filePath, agentKey);
  for (const event of events) {
    await this.ingestStartupEvent(agentKey, event);
  }
}

private async ingestStartupEvent(agentKey: string, event: StartupEvent): Promise<void> {
  await this.db.insertInto('startup_events').values({
    agent_key: agentKey,
    subtype: event.subtype,
    status: event.status,
    ts: Date.parse(event.timestamp),
    summary: event.summary,
    duration_ms: event.durationMs ?? null,
    log_path: event.logPath ?? null,
  }).onConflict(/* dedupe on (agent_key, subtype, status, ts) */).execute();

  this.eventBus.publish({ type: 'startup.event', data: { key: agentKey, ... } });
}
```

### Daemon storage — new `startup_events` table

Migration `00NN_startup_events.ts`:

```sql
CREATE TABLE IF NOT EXISTS startup_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_key TEXT NOT NULL REFERENCES agents(key),
  subtype TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  ts INTEGER NOT NULL,                    -- ms since epoch
  summary TEXT NOT NULL,
  duration_ms INTEGER,
  log_path TEXT,
  UNIQUE(agent_key, subtype, status, ts)  -- dedupe on file re-read
);

CREATE INDEX IF NOT EXISTS startup_events_agent_ts ON startup_events (agent_key, ts);
```

### Timeline endpoint — merge startup events into the stream

`AgentsService.getTimeline(agentKey)` currently reads the transcript JSONL. Extend to also fetch startup events from the new table and merge by ts:

```ts
async getTimeline(agentKey: string): Promise<{ events: TranscriptEvent[] }> {
  const transcriptEvents = await this.readTranscript(agentKey);
  const startupEvents = await this.db.selectFrom('startup_events')
    .where('agent_key', '=', agentKey)
    .selectAll()
    .orderBy('ts')
    .execute();

  const startupAsTranscript = startupEvents.map(rowToTranscriptEvent);
  return {
    events: [...startupAsTranscript, ...transcriptEvents].sort(byTs),
  };
}
```

`rowToTranscriptEvent` maps the DB row to a TranscriptEvent shape the frontend already handles — specifically the system-event subtype with custom payload.

### State-transition implications

Startup events that complete successfully shouldn't fire state transitions (agent stays `initializing` until first Claude tool_call). Startup events that **fail** SHOULD transition to `error`:

```ts
if (event.status === 'failed') {
  // Transition agent to error state
  await this.recordError(agentKey, event.ts);
}
```

`recordError` may already exist (or needs adding) — checks current state, only transitions if previous was `initializing`.

### Frontend rendering

Existing TranscriptRow handles `system` events with subtypes. Add per-phase labels in `event-labels.ts`:

```ts
SYSTEM_LABELS = {
  // existing
  stop_hook_summary: 'Stop hook',
  turn_duration: 'Turn',
  api_error: 'API error',
  // new (CREW-201)
  crew_startup_worktree: 'Worktree',
  crew_startup_npm_install: 'npm install',
  crew_startup_docker: 'Docker',
  crew_startup_mcp: 'MCP',
  crew_startup_claude_spawn: 'Claude spawn',
};
```

TranscriptRow's `specForSystem` reads the new fields:

```ts
// existing branch, slightly extended
const status = (event as { status?: string }).status;
const isFailed = status === 'failed';
return {
  blockType: 'system',
  category: 'system',
  tone: isFailed ? 'error' : 'default',
  tagLabel: labelForSystem(subtype),
  oneLiner: truncate(event.summary ?? ''),
  timestamp: event.timestamp,
  expanded: prettyJson(event),  // shows full event including logPath
};
```

For phases with `logPath`, the expanded view shows the path; user can grep manually. Future enhancement: clickable link that streams the log content via a new daemon endpoint (out of scope here).

## Testing

### Shared

`packages/shared/src/types.test.ts` — `StartupEvent` shape pinned.

### CLI

`packages/cli/src/lib/startup-events/writer.test.ts` — writer creates the dir + appends JSONL.

Integration test on the bringup flow: dispatching a no-op fixture run produces the expected sequence of phase events in `~/.crew/startup/<key>.jsonl`.

### Daemon

`IngestService.test.ts`:
- Chokidar watcher picks up new file → events ingested into `startup_events`.
- Duplicate event (re-read) is deduped.
- Failed startup event triggers `recordError` transition.

`AgentsService.test.ts`:
- `getTimeline` merges startup events + transcript events in timestamp order.
- Empty startup events (no file) returns transcript-only.

### Frontend

`TranscriptRow.test.tsx` — new system subtypes render with the correct labels.

### Visual

After CREW-196 lands (Starting section), the drawer Timeline's Starting section shows the per-phase rows for a fresh dispatch. Failed phase rows render in red.

## Migration / rollout

- New table — migration only adds; no destructive changes.
- CLI emits events from day one for all dispatch types (run / fix-pr / finish).
- Daemon ignores agent keys whose `startup_events` file doesn't exist — old agents have no startup data, just don't render those rows.

## Out of scope

- Streaming the full /tmp log content inside the expanded view (clickable logPath is enough for v1).
- Capturing startup of non-dispatch commands (`crew status`, `crew configure`, etc.).
- Per-line log ingest.
- Cross-machine startup capture (only the host running the CLI sees its own startup; multi-host setups would need a daemon-side API).

## Risks

- **CLI/daemon writes/reads race.** The daemon's chokidar might fire while the CLI is mid-write. Standard append-only JSONL semantics + line-buffered reads mitigate this; tail-and-parse should skip partial lines and re-read on the next `change` event.
- **Empty file on first write.** chokidar's `add` event fires before content is written. The handler should tolerate empty files (skip if no lines yet) and re-trigger on the next `change`.
- **Disk-space.** Per-key startup files are small (<1KB typically) — well under any concern. Cleanup on agent deletion isn't immediately needed; can fold into a future janitor.
- **Phase-event ordering.** If the CLI writes async and a slow file system reorders, ts ordering keeps the timeline correct. The dedupe key includes `ts` so even re-writes don't duplicate.
- **Daemon not running when CLI starts a dispatch.** The CLI writes to the file regardless; daemon picks up events when it next starts (chokidar's `add` event fires for existing files on startup). Tested via "agent dispatched before daemon was up" scenario.
