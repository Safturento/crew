import { promises as fsp, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { Kysely, Transaction } from 'kysely';
import type { Logger } from 'pino';
import {
  claudeProjectDirFor,
  startupEventSchema,
  stateEventSchema,
  summarizeInput,
  tailTranscript,
  type AssistantEvent,
  type StartupEvent,
  type StateEvent,
  type ToolUseContent,
  type TranscriptEvent,
} from 'crew-shared';
import type { DaemonDatabase } from '../db.js';
import type { EventBus } from './EventBus.js';
import { reduceState } from './state-reduce.js';
import type { TransitionState, TransitionTarget } from './state-derivation.js';

export interface IngestServiceDeps {
  db: Kysely<DaemonDatabase>;
  logger: Logger;
  eventBus: EventBus;
}

export interface AttachInput {
  runId: number;
  /** Concrete JSONL path. Wins over the worktreePath/sessionId pair when set. */
  jsonlPath?: string;
  worktreePath?: string;
  sessionId?: string;
}

export interface ResolveJsonlPathInput {
  worktreePath: string;
  sessionId: string;
}

export interface StartOptions {
  /** Test seam — bypass the real `~/.claude/projects/<slug>/` lookup. */
  resolveJsonlPath?: (input: ResolveJsonlPathInput) => string;
}

export interface ProcessEventInput {
  runId: number;
  agentKey: string;
  event: TranscriptEvent;
}

/**
 * Ingests transcript events for active runs. One tail per run, keyed on
 * `runId`. `attach` starts a fire-and-forget background tail; `detach`
 * aborts it. The tail's contract guarantees one final drain pass after
 * abort, so trailing lines written just before claude exits are still
 * captured.
 *
 * - Only assistant-with-tool-use events become `tool_calls` rows.
 * - Idempotent on (run_id, occurred_at, tool_name) via the migration's
 *   UNIQUE index plus `ON CONFLICT DO NOTHING` here.
 * - After each successful insert, publish a `tool_calls.changed` ping
 *   (agent key only — payload bloat would defeat the SSE invalidation
 *   pattern) so the dashboard re-fetches the run's timeline/metrics.
 *
 * Agent **state** is no longer inferred from the transcript (CREW-257): the
 * old `gh pr create` tool-call scan + `computeNextState` machine was removed
 * once concrete lifecycle events (CREW-252 Epic) became the single source of
 * truth. State now flows exclusively through `ingestStateEvent` (the
 * `~/.crew/state-events` log) plus the route-driven `recordFinishCompleted` /
 * `recordRunCompleted` / `recordError` paths. Transcript ingestion is purely
 * tool_calls/timeline/metrics.
 */
export class IngestService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly logger: Logger;
  private readonly eventBus: EventBus;
  private readonly tails = new Map<number, AbortController>();
  /** Per-agent derived-state cache. Lazily seeded from the latest
   *  `state_transitions` row so a daemon restart mid-session does not
   *  re-emit a duplicate flip. Typed `TransitionTarget` (the wider union)
   *  because the concrete-event reducer (CREW-254) can land an agent in
   *  `idle`, which the narrower `TransitionState` excludes. */
  private readonly agentStateCache = new Map<string, TransitionTarget>();
  /** runId → agent_key resolution cache so the per-event hot path doesn't
   *  re-SELECT from `runs`. Populated lazily (or by `attach`). */
  private readonly runToAgent = new Map<number, string>();
  /** CREW-201: chokidar watcher on ~/.crew/startup. One watcher per
   *  daemon — covers every agent. */
  private startupWatcher: FSWatcher | undefined;
  /** CREW-265: resolves when the startup watcher's initial scan has readied.
   *  Boot must NOT block on this (a slow/hung bind-mount would crash the
   *  daemon); it exists only as a deterministic await seam for tests, via
   *  `whenStartupWatcherReady()`. */
  private startupWatcherReady: Promise<void> | undefined;
  /** Per-file byte offset of the last fully-consumed (i.e. ended in `\n`)
   *  position; lets the watcher re-read only new lines on `change` and
   *  preserves any trailing partial line so a mid-append `change` event
   *  doesn't drop the in-flight event. */
  private readonly startupFileOffsets = new Map<string, number>();
  /** Per-file leftover bytes from a `change` event that fired before
   *  the appending CLI flushed the trailing newline. Prepended to the
   *  next read so the line eventually completes intact. */
  private readonly startupFileBuffers = new Map<string, string>();
  /** CREW-254: chokidar watcher on ~/.crew/state-events — the concrete
   *  state-event log. Mirrors the startup watcher exactly; one per daemon. */
  private stateEventWatcher: FSWatcher | undefined;
  /** CREW-265: ready-await seam for the state-event watcher's initial scan.
   *  Boot must not block on it — see `whenStateWatcherReady()`. */
  private stateEventWatcherReady: Promise<void> | undefined;
  /** Per-file consumed-byte offset for the state-events log (see the startup
   *  equivalent for the offset/leftover protocol). */
  private readonly stateEventFileOffsets = new Map<string, number>();
  /** Per-file trailing partial line carried across `change` events for the
   *  state-events log. */
  private readonly stateEventFileBuffers = new Map<string, string>();

  constructor(deps: IngestServiceDeps) {
    this.db = deps.db;
    this.logger = deps.logger;
    this.eventBus = deps.eventBus;
  }

  /**
   * Crash-recovery path. At daemon boot, attach a tail to every run
   * that has not completed yet. Each row carries the worktree path
   * (joined from `agents`) and the session id, which together resolve
   * to the on-disk JSONL.
   */
  async start(opts: StartOptions = {}): Promise<void> {
    const open = await this.db
      .selectFrom('runs')
      .innerJoin('agents', 'agents.key', 'runs.agent_key')
      .select([
        'runs.id as runId',
        'runs.session_id as sessionId',
        'runs.agent_key as agentKey',
        'agents.worktree_path as worktreePath',
      ])
      .where('runs.completed_at', 'is', null)
      .execute();
    const resolve = opts.resolveJsonlPath ?? defaultResolveJsonlPath;
    for (const row of open) {
      this.runToAgent.set(row.runId, row.agentKey);
      const jsonlPath = resolve({ worktreePath: row.worktreePath, sessionId: row.sessionId });
      this.attach({ runId: row.runId, jsonlPath });
    }
  }

  attach(input: AttachInput): void {
    if (this.tails.has(input.runId)) return;
    const jsonlPath = resolveAttachPath(input);

    const controller = new AbortController();
    this.tails.set(input.runId, controller);

    void this.runTail(input.runId, jsonlPath, controller.signal).catch((err: unknown) => {
      this.logger.warn({ err, runId: input.runId, jsonlPath }, 'ingest tail crashed');
    });
  }

  detach(runId: number): void {
    const controller = this.tails.get(runId);
    if (!controller) return;
    controller.abort();
    this.tails.delete(runId);
  }

  async stop(): Promise<void> {
    for (const controller of this.tails.values()) controller.abort();
    this.tails.clear();
    await this.stopStartupWatcher();
    await this.stopStateEventWatcher();
  }

  /**
   * CREW-201: watch `~/.crew/startup/*.jsonl` and ingest per-phase
   * startup events as they arrive. Mirrors the chokidar pattern named
   * in the spec (parallel to the existing per-run JSONL tail). Re-fires
   * `change` events while a file is being appended — the offset cache
   * skips lines already ingested, and the (agent_key, subtype, status,
   * ts) UNIQUE keeps anything that slips through idempotent.
   */
  watchStartupEvents(startupDir: string): void {
    mkdirSync(startupDir, { recursive: true });
    // Watch the directory itself (not a glob); chokidar's glob support is
    // deferred to consumer libs in v4. Filter to `.jsonl` in the handler.
    this.startupWatcher = chokidar.watch(startupDir, {
      persistent: true,
      ignoreInitial: false,
      depth: 1,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });
    const handle = (filePath: string): void => {
      if (!filePath.endsWith('.jsonl')) return;
      void this.onStartupFile(filePath).catch((err: unknown) => {
        this.logger.warn({ err, filePath }, 'startup-event file handler crashed');
      });
    };
    this.startupWatcher.on('add', handle);
    this.startupWatcher.on('change', handle);
    // CREW-265: chokidar resolves the watcher's initial scan asynchronously.
    // Boot must NOT await it (a slow/hung bind-mount must never crash the
    // daemon — the offset-tracked add/change handlers ingest existing lines
    // whenever the scan completes regardless). We only capture the ready
    // promise so tests can await it explicitly via `whenStartupWatcherReady()`,
    // avoiding a writeFileSync racing the watcher attach.
    const watcher = this.startupWatcher;
    this.startupWatcherReady = new Promise<void>((resolve) => {
      watcher.once('ready', () => resolve());
    });
  }

  /**
   * CREW-265: deterministic test seam — resolves once the startup watcher's
   * initial scan has readied. Resolves immediately when no watcher is attached.
   * Boot deliberately does not call this; only tests do.
   */
  async whenStartupWatcherReady(): Promise<void> {
    await (this.startupWatcherReady ?? Promise.resolve());
  }

  async stopStartupWatcher(): Promise<void> {
    if (!this.startupWatcher) return;
    await this.startupWatcher.close();
    this.startupWatcher = undefined;
    this.startupWatcherReady = undefined;
    this.startupFileOffsets.clear();
    this.startupFileBuffers.clear();
  }

  /**
   * CREW-254: watch `~/.crew/state-events/*.jsonl` — the concrete lifecycle
   * log producers (CLI run/fix-pr/finish, the runner-exit path, the
   * PostToolUse pr-create hook) append to. Each line is reduced against the
   * agent's current state to drive `state_transitions`. A near-clone of
   * `watchStartupEvents`: same offset/partial-line protocol; idempotency comes
   * from the per-eventId `state_events_applied` ledger rather than a UNIQUE
   * index, so a re-read after a daemon restart never double-applies.
   */
  watchStateEvents(stateEventsDir: string): void {
    mkdirSync(stateEventsDir, { recursive: true });
    this.stateEventWatcher = chokidar.watch(stateEventsDir, {
      persistent: true,
      ignoreInitial: false,
      depth: 1,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });
    const handle = (filePath: string): void => {
      if (!filePath.endsWith('.jsonl')) return;
      void this.onStateEventFile(filePath).catch((err: unknown) => {
        this.logger.warn({ err, filePath }, 'state-event file handler crashed');
      });
    };
    this.stateEventWatcher.on('add', handle);
    this.stateEventWatcher.on('change', handle);
    // CREW-265: see `watchStartupEvents` — attach now, never block boot on the
    // initial scan; expose the ready promise as a test-only await seam.
    const watcher = this.stateEventWatcher;
    this.stateEventWatcherReady = new Promise<void>((resolve) => {
      watcher.once('ready', () => resolve());
    });
  }

  /**
   * CREW-265: deterministic test seam — resolves once the state-event watcher's
   * initial scan has readied. Resolves immediately when no watcher is attached.
   * Boot deliberately does not call this; only tests do.
   */
  async whenStateWatcherReady(): Promise<void> {
    await (this.stateEventWatcherReady ?? Promise.resolve());
  }

  async stopStateEventWatcher(): Promise<void> {
    if (!this.stateEventWatcher) return;
    await this.stateEventWatcher.close();
    this.stateEventWatcher = undefined;
    this.stateEventWatcherReady = undefined;
    this.stateEventFileOffsets.clear();
    this.stateEventFileBuffers.clear();
  }

  /**
   * CREW-254: apply one concrete state event. Dedups on `eventId` (exactly-once
   * across replays), reduces `(currentState, event) → next | null`, and on a
   * real transition writes a `state_transitions` row + publishes
   * `agent.state_changed`. The `eventId` is recorded even on a no-op reduce so
   * a later replay of the same line stays a no-op. `pr_created` additionally
   * stamps `agents.pr_url`. Test seam: the live watcher feeds parsed events
   * through this same method.
   */
  async ingestStateEvent(event: StateEvent): Promise<void> {
    // Dedup first: skip if this eventId was already applied.
    const already = await this.db
      .selectFrom('state_events_applied')
      .select('event_id')
      .where('event_id', '=', event.eventId)
      .executeTakeFirst();
    if (already) return;

    const ts = Date.parse(event.ts);
    if (!Number.isFinite(ts)) {
      this.logger.warn(
        { key: event.key, event: event.event, ts: event.ts },
        'unparseable state-event ts; skipping',
      );
      return;
    }

    const previous = await this.getCachedAgentState(event.key);
    const next = reduceState(previous, event.event, event.exitCode);

    // Atomicity matters: the dedup-ledger row and the state_transitions row
    // must commit together. If the ledger row landed but the transition write
    // crashed, a restart's replay would dedup on the ledger row and never write
    // the transition — the agent would be stuck in `previous` forever. One
    // transaction closes that window: a crash before commit rolls back both, so
    // the replay re-applies cleanly. The eventId is recorded even on a no-op
    // reduce (so a replay stays a no-op).
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('state_events_applied')
        .values({ event_id: event.eventId, agent_key: event.key, ts })
        .onConflict((oc) => oc.column('event_id').doNothing())
        .execute();

      if (event.event === 'pr_created' && event.prUrl) {
        await trx
          .updateTable('agents')
          .set({ pr_url: event.prUrl })
          .where('key', '=', event.key)
          .execute();
      }

      if (next !== null) {
        await this.writeTransitionRow(trx, {
          agentKey: event.key,
          from: previous,
          to: next,
          ts,
          source: event.source,
        });
      }
    });

    if (next === null) return;

    // Advance the in-memory cache + publish only after the commit, so neither
    // ever reflects a rolled-back write.
    this.announceTransition({ agentKey: event.key, from: previous, to: next, ts });
  }

  /** Test seam — feeds a single parsed event through the same code path
   *  the live watcher uses. */
  async ingestStartupEvent(agentKey: string, event: StartupEvent): Promise<void> {
    const ts = Date.parse(event.timestamp);
    if (!Number.isFinite(ts)) {
      this.logger.warn(
        { agentKey, subtype: event.subtype, timestamp: event.timestamp },
        'unparseable startup-event timestamp; skipping',
      );
      return;
    }
    await this.db
      .insertInto('startup_events')
      .values({
        agent_key: agentKey,
        subtype: event.subtype,
        status: event.status,
        ts,
        summary: event.summary,
        duration_ms: event.durationMs ?? null,
        log_path: event.logPath ?? null,
      })
      .onConflict((oc) => oc.columns(['agent_key', 'subtype', 'status', 'ts']).doNothing())
      .execute();

    this.eventBus.publish({
      type: 'startup_events.changed',
      data: { key: agentKey },
    });

    if (event.status === 'failed') {
      await this.recordError(agentKey, ts);
    }
  }

  /**
   * CREW-201: transition an agent to `error` when a startup phase
   * fails. Idempotent — once already in `error` (or `finished`), this
   * is a no-op. The `finished` guard avoids regressing a late failure
   * notification past a clean finish. Publishes the SSE flip alongside
   * the state_transitions row so the dashboard's list view turns red
   * immediately.
   */
  async recordError(agentKey: string, ts: number): Promise<void> {
    const previous = await this.getCachedAgentState(agentKey);
    if (previous === 'error' || previous === 'finished') return;

    await this.writeTransitionRow(this.db, {
      agentKey,
      from: previous,
      to: 'error',
      ts,
      source: 'startup-failure',
    });
    this.announceTransition({ agentKey, from: previous, to: 'error', ts });
  }

  private async onStartupFile(filePath: string): Promise<void> {
    const agentKey = basename(filePath, '.jsonl');
    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch (err) {
      this.logger.debug({ err, filePath }, 'startup file stat failed (likely transient)');
      return;
    }

    const lastOffset = this.startupFileOffsets.get(filePath) ?? 0;
    if (stat.size === lastOffset) return;
    if (stat.size < lastOffset) {
      // Truncated (or rotated) — restart from the beginning.
      this.startupFileOffsets.set(filePath, 0);
      this.startupFileBuffers.delete(filePath);
    }
    const startOffset = this.startupFileOffsets.get(filePath) ?? 0;

    const fh = await fsp.open(filePath, 'r');
    let appended: string;
    try {
      const len = stat.size - startOffset;
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, startOffset);
      appended = buf.toString('utf8');
    } finally {
      await fh.close();
    }

    // Splice carried-over partial line in front of the new bytes. Then
    // split on `\n` and reserve the final (possibly empty, possibly
    // partial) chunk as the new leftover — only chunks before the
    // trailing newline are guaranteed complete.
    const carried = this.startupFileBuffers.get(filePath) ?? '';
    const combined = carried + appended;
    const lastNewlineIdx = combined.lastIndexOf('\n');
    if (lastNewlineIdx === -1) {
      // No newline yet — entire append is partial, hold for next change.
      this.startupFileBuffers.set(filePath, combined);
      this.startupFileOffsets.set(filePath, stat.size);
      return;
    }
    const consumable = combined.slice(0, lastNewlineIdx);
    const leftover = combined.slice(lastNewlineIdx + 1);
    this.startupFileBuffers.set(filePath, leftover);
    this.startupFileOffsets.set(filePath, stat.size);

    for (const raw of consumable.split('\n')) {
      const line = raw.trim();
      if (line.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        this.logger.warn({ err, agentKey, line }, 'startup event JSON parse failed');
        continue;
      }
      const result = startupEventSchema.safeParse(parsed);
      if (!result.success) {
        this.logger.warn(
          { issues: result.error.issues, agentKey, line },
          'startup event schema mismatch',
        );
        continue;
      }
      await this.ingestStartupEvent(agentKey, result.data);
    }
  }

  /**
   * CREW-254: read-and-reduce the new lines appended to a single
   * `~/.crew/state-events/<key>.jsonl`. Byte-offset + partial-line protocol is
   * identical to `onStartupFile`; the terminal action is
   * `ingestStateEvent(result.data)` rather than `ingestStartupEvent`.
   */
  private async onStateEventFile(filePath: string): Promise<void> {
    const agentKey = basename(filePath, '.jsonl');
    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch (err) {
      this.logger.debug({ err, filePath }, 'state-event file stat failed (likely transient)');
      return;
    }

    const lastOffset = this.stateEventFileOffsets.get(filePath) ?? 0;
    if (stat.size === lastOffset) return;
    if (stat.size < lastOffset) {
      // Truncated (or rotated) — restart from the beginning.
      this.stateEventFileOffsets.set(filePath, 0);
      this.stateEventFileBuffers.delete(filePath);
    }
    const startOffset = this.stateEventFileOffsets.get(filePath) ?? 0;

    const fh = await fsp.open(filePath, 'r');
    let appended: string;
    try {
      const len = stat.size - startOffset;
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, startOffset);
      appended = buf.toString('utf8');
    } finally {
      await fh.close();
    }

    const carried = this.stateEventFileBuffers.get(filePath) ?? '';
    const combined = carried + appended;
    const lastNewlineIdx = combined.lastIndexOf('\n');
    if (lastNewlineIdx === -1) {
      this.stateEventFileBuffers.set(filePath, combined);
      this.stateEventFileOffsets.set(filePath, stat.size);
      return;
    }
    const consumable = combined.slice(0, lastNewlineIdx);
    const leftover = combined.slice(lastNewlineIdx + 1);
    this.stateEventFileBuffers.set(filePath, leftover);
    this.stateEventFileOffsets.set(filePath, stat.size);

    for (const raw of consumable.split('\n')) {
      const line = raw.trim();
      if (line.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        this.logger.warn({ err, agentKey, line }, 'state event JSON parse failed');
        continue;
      }
      const result = stateEventSchema.safeParse(parsed);
      if (!result.success) {
        this.logger.warn(
          { issues: result.error.issues, agentKey, line },
          'state event schema mismatch',
        );
        continue;
      }
      await this.ingestStateEvent(result.data);
    }
  }

  /**
   * Records the `finished` state transition when a `crew finish` run
   * completes cleanly (CREW-116). The transcript-tail path can't see this
   * — finish does not spawn Claude — so the runs route calls in here
   * after stamping `completed_at` + `exit_code`. Idempotent: re-firing for
   * an agent already in `finished` is a no-op.
   */
  async recordFinishCompleted(agentKey: string, completedAtIso: string): Promise<void> {
    const previous = await this.getCachedAgentState(agentKey);
    if (previous === 'finished') return;

    const ts = Date.parse(completedAtIso);
    if (!Number.isFinite(ts)) {
      this.logger.warn(
        { agentKey, completedAtIso },
        'unparseable completedAt; skipping finished transition',
      );
      return;
    }

    await this.writeTransitionRow(this.db, {
      agentKey,
      from: previous,
      to: 'finished',
      ts,
      source: 'cli-finish',
    });
    this.announceTransition({ agentKey, from: previous, to: 'finished', ts });
  }

  /**
   * Records the `running → pr_open` cycle-back transition that closes the
   * fix-pr loop (CREW-198). Only fires when (a) the agent is currently
   * `running`, and (b) the completing run's command is `fix-pr` — a
   * completing initial `run` doesn't snap an agent into `pr_open` it never
   * reached on its own. Called from the runs/:runId/complete route alongside
   * `recordFinishCompleted`.
   */
  async recordRunCompleted(agentKey: string, runId: number, completedAtIso: string): Promise<void> {
    const previous = await this.getCachedAgentState(agentKey);
    if (previous !== 'running') return;

    const run = await this.db
      .selectFrom('runs')
      .select('command')
      .where('id', '=', runId)
      .executeTakeFirst();
    if (run?.command !== 'fix-pr') return;

    const ts = Date.parse(completedAtIso);
    if (!Number.isFinite(ts)) {
      this.logger.warn(
        { agentKey, completedAtIso },
        'unparseable completedAt; skipping fix-pr cycle-back transition',
      );
      return;
    }

    await this.writeTransitionRow(this.db, {
      agentKey,
      from: 'running',
      to: 'pr_open',
      ts,
      source: 'cli-fixpr',
    });
    this.announceTransition({ agentKey, from: 'running', to: 'pr_open', ts });
  }

  /**
   * CREW-259 — operator escape hatch. Forces an agent to `toState`, bypassing
   * `reduceState` and its terminal stickiness: the one path that can move an
   * agent OUT of `finished`/`pr_merged`. Writes the transition (`source:
   * 'override'`), advances the cache (so a later automatic event reduces against
   * the corrected state, not a stale one), and publishes the SSE. No-op when
   * already in the target state. Not a lifecycle fact — never touches the
   * durable `~/.crew/state-events` log or the dedup ledger.
   */
  async recordStateOverride(
    agentKey: string,
    toState: TransitionTarget,
  ): Promise<
    { from: TransitionTarget; to: TransitionTarget } | { noop: true; state: TransitionTarget }
  > {
    const from = await this.getCachedAgentState(agentKey);
    if (from === toState) return { noop: true, state: toState };
    const ts = Date.now();
    await this.writeTransitionRow(this.db, { agentKey, from, to: toState, ts, source: 'override' });
    this.announceTransition({ agentKey, from, to: toState, ts });
    return { from, to: toState };
  }

  async ingestEvent(runId: number, event: TranscriptEvent): Promise<void> {
    const agentKey = await this.resolveAgentKey(runId);
    if (!agentKey) return;
    await this.processEvent({ runId, agentKey, event });
  }

  /**
   * Test seam — feeds a single event through the same code path the live
   * tail uses, but lets the caller supply `agentKey` directly instead of
   * resolving it from a real `runs` row. Exercises tool_calls ingestion +
   * the `tool_calls.changed` ping without a full attach lifecycle.
   */
  async processEventForTest(input: ProcessEventInput): Promise<void> {
    await this.processEvent(input);
  }

  private async processEvent(input: ProcessEventInput): Promise<void> {
    const { event } = input;
    if (event.type === 'assistant') {
      await this.handleAssistantEvent({ ...input, event });
    }
  }

  private async handleAssistantEvent(input: {
    runId: number;
    agentKey: string;
    event: AssistantEvent;
  }): Promise<void> {
    const { runId, agentKey, event } = input;
    const toolUse = event.message.content.find((c): c is ToolUseContent => c.type === 'tool_use');
    if (!toolUse) return;

    const summary = summarizeInput(toolUse.name, toolUse.input);
    const usage = event.message.usage;
    const result = await this.db
      .insertInto('tool_calls')
      .values({
        run_id: runId,
        tool_name: toolUse.name,
        input_summary: summary,
        output_tokens: usage.output_tokens ?? 0,
        input_tokens: usage.input_tokens ?? 0,
        cache_read_tokens: usage.cache_read_input_tokens ?? 0,
        cache_creation_tokens: usage.cache_creation_input_tokens ?? 0,
        occurred_at: event.timestamp,
      })
      .onConflict((oc) => oc.columns(['run_id', 'occurred_at', 'tool_name']).doNothing())
      .executeTakeFirst();

    const inserted = (result?.numInsertedOrUpdatedRows ?? 0n) > 0n;
    if (!inserted) return;

    this.eventBus.publish({ type: 'tool_calls.changed', data: { key: agentKey } });
  }

  /**
   * CREW-259: single insert point for `state_transitions`. Takes `exec` (either
   * `this.db` or a Kysely transaction) so it can run inside `ingestStateEvent`'s
   * dedup transaction or standalone from the route-driven writers. Every hop now
   * stamps `source` — see the migration 0012 doc for the value vocabulary.
   */
  private async writeTransitionRow(
    exec: Kysely<DaemonDatabase> | Transaction<DaemonDatabase>,
    args: {
      agentKey: string;
      from: TransitionTarget | null;
      to: TransitionTarget;
      ts: number;
      source: string;
    },
  ): Promise<void> {
    await exec
      .insertInto('state_transitions')
      .values({
        agent_key: args.agentKey,
        from_state: args.from,
        to_state: args.to,
        ts: args.ts,
        source: args.source,
      })
      .execute();
  }

  /**
   * CREW-259: the post-write tail shared by every transition-writer — advance
   * the in-memory state cache and publish the `agent.state_changed` SSE. Split
   * from `writeTransitionRow` because `ingestStateEvent` must defer this until
   * after its transaction commits (so neither cache nor SSE ever reflects a
   * rolled-back write), while the standalone writers run it inline.
   */
  private announceTransition(args: {
    agentKey: string;
    from: TransitionTarget | null;
    to: TransitionTarget;
    ts: number;
  }): void {
    this.agentStateCache.set(args.agentKey, args.to);
    this.eventBus.publish({
      type: 'agent.state_changed',
      data: { key: args.agentKey, from: args.from, to: args.to, ts: args.ts },
    });
  }

  private async getCachedAgentState(agentKey: string): Promise<TransitionTarget> {
    const cached = this.agentStateCache.get(agentKey);
    if (cached !== undefined) return cached;
    const latest = await this.db
      .selectFrom('state_transitions')
      .select('to_state')
      .where('agent_key', '=', agentKey)
      .orderBy('ts', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    // Recognize the full target set (incl. `idle`/`waiting`, CREW-254) on
    // read-back so a concrete-event state survives a daemon restart instead of
    // collapsing to `init`.
    const initial: TransitionTarget = isTransitionTarget(latest?.to_state)
      ? latest.to_state
      : 'init';
    this.agentStateCache.set(agentKey, initial);
    return initial;
  }

  private async resolveAgentKey(runId: number): Promise<string | null> {
    const cached = this.runToAgent.get(runId);
    if (cached) return cached;
    const row = await this.db
      .selectFrom('runs')
      .select('agent_key')
      .where('id', '=', runId)
      .executeTakeFirst();
    if (!row) return null;
    this.runToAgent.set(runId, row.agent_key);
    return row.agent_key;
  }

  private async runTail(runId: number, path: string, signal: AbortSignal): Promise<void> {
    for await (const event of tailTranscript(path, { signal })) {
      try {
        await this.ingestEvent(runId, event);
      } catch (err) {
        this.logger.warn({ err, runId, path }, 'ingestEvent failed');
      }
    }
  }
}

function defaultResolveJsonlPath(input: ResolveJsonlPathInput): string {
  return join(claudeProjectDirFor(input.worktreePath), `${input.sessionId}.jsonl`);
}

function resolveAttachPath(input: AttachInput): string {
  if (input.jsonlPath) return input.jsonlPath;
  if (input.worktreePath && input.sessionId) {
    return defaultResolveJsonlPath({
      worktreePath: input.worktreePath,
      sessionId: input.sessionId,
    });
  }
  throw new Error(
    'IngestService.attach requires either jsonlPath or both worktreePath and sessionId',
  );
}

// Mirrors `isTransitionState`'s set plus the two reserved states the concrete
// reducer activates (CREW-254/257). Intentionally keeps that helper's legacy
// quirk of treating a stored `error` as a cold-read miss (→ `init`), so existing
// error read-back behavior is unchanged; only `idle`/`waiting` are newly kept.
// CREW-307: `queued`/`orphaned` are kept too, so a queued birth (or an orphaned
// mismatch) survives a daemon restart instead of collapsing to `init`.
function isTransitionTarget(s: string | null | undefined): s is TransitionTarget {
  return isTransitionState(s) || s === 'idle' || s === 'waiting';
}

function isTransitionState(s: string | null | undefined): s is TransitionState {
  return (
    s === 'init' ||
    s === 'queued' ||
    s === 'running' ||
    s === 'pr_open' ||
    s === 'pr_merged' ||
    s === 'finished' ||
    s === 'orphaned'
  );
}
