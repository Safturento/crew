import { promises as fsp, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import {
  claudeProjectDirFor,
  hasPrCreateInvocation,
  startupEventSchema,
  summarizeInput,
  tailTranscript,
  type AssistantEvent,
  type StartupEvent,
  type ToolResultContent,
  type ToolUseContent,
  type TranscriptEvent,
  type UserEvent,
} from 'crew-shared';
import type { DaemonDatabase } from '../db.js';
import type { EventBus } from './EventBus.js';
import type { TransitionState } from './state-derivation.js';

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

const PR_URL_REGEX = /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/;

/**
 * Ingests transcript events for active runs. One tail per run, keyed on
 * `runId`. `attach` starts a fire-and-forget background tail; `detach`
 * aborts it. The tail's contract guarantees one final drain pass after
 * abort, so trailing lines written just before claude exits are still
 * captured.
 *
 * Per slice 1b spec:
 * - Only assistant-with-tool-use events become `tool_calls` rows.
 * - Idempotent on (run_id, occurred_at, tool_name) via the migration's
 *   UNIQUE index plus `ON CONFLICT DO NOTHING` here.
 *
 * Slice 1c (CREW-100) extensions, layered on top of the slice 1b path:
 * - After each successful tool_calls insert, publish a `tool_calls.changed`
 *   ping (agent key only — payload bloat would defeat the SSE invalidation
 *   pattern) and re-derive the agent's state from a per-agent in-memory
 *   cache. On flip, insert a `state_transitions` row + publish
 *   `agent.state_changed`.
 * - When a Bash tool_use's input.command starts with `gh pr create`, hold
 *   the tool_use.id in an in-flight map; when the matching `tool_result`
 *   lands, regex-scan its content for the GitHub PR URL and write it to
 *   `agents.pr_url`. NULL on no match (logged at debug). The schema's
 *   PR URL lives on `agents`, not `runs`, so that's where we write — the
 *   slice 1c spec wording "runs.pr_url" predates the slice 1a schema
 *   choice.
 */
export class IngestService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly logger: Logger;
  private readonly eventBus: EventBus;
  private readonly tails = new Map<number, AbortController>();
  /** Per-agent derived-state cache. Lazily seeded from the latest
   *  `state_transitions` row so a daemon restart mid-session does not
   *  re-emit a duplicate flip. */
  private readonly agentStateCache = new Map<string, TransitionState>();
  /** In-flight `gh pr create` tool_use ids → run/agent context for matching
   *  the follow-up `tool_result`. Bounded by the number of concurrent PR
   *  creates per agent in practice (≈1), so we don't TTL-evict. */
  private readonly pendingPrCreates = new Map<string, { runId: number; agentKey: string }>();
  /** runId → agent_key resolution cache so the per-event hot path doesn't
   *  re-SELECT from `runs`. Populated lazily (or by `attach`). */
  private readonly runToAgent = new Map<number, string>();
  /** Per-agent the `run_id` of the most-recently-ingested tool_call. Drives
   *  the `pr_open → running` re-cycle when a `crew fix-pr` (or any future
   *  re-dispatch) starts a structurally-new run on an agent already in
   *  `pr_open`. CREW-198. */
  private readonly lastRunIdCache = new Map<string, number>();
  /** CREW-201: chokidar watcher on ~/.crew/startup. One watcher per
   *  daemon — covers every agent. */
  private startupWatcher: FSWatcher | undefined;
  /** Per-file byte offset of the last fully-consumed (i.e. ended in `\n`)
   *  position; lets the watcher re-read only new lines on `change` and
   *  preserves any trailing partial line so a mid-append `change` event
   *  doesn't drop the in-flight event. */
  private readonly startupFileOffsets = new Map<string, number>();
  /** Per-file leftover bytes from a `change` event that fired before
   *  the appending CLI flushed the trailing newline. Prepended to the
   *  next read so the line eventually completes intact. */
  private readonly startupFileBuffers = new Map<string, string>();

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
  }

  /**
   * CREW-201: watch `~/.crew/startup/*.jsonl` and ingest per-phase
   * startup events as they arrive. Mirrors the chokidar pattern named
   * in the spec (parallel to the existing per-run JSONL tail). Re-fires
   * `change` events while a file is being appended — the offset cache
   * skips lines already ingested, and the (agent_key, subtype, status,
   * ts) UNIQUE keeps anything that slips through idempotent.
   */
  async watchStartupEvents(startupDir: string): Promise<void> {
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
    // chokidar resolves the watcher asynchronously; in tests we want to
    // await the initial scan so a writeFileSync-just-after-await isn't
    // racing against the watcher attaching.
    const watcher = this.startupWatcher;
    await new Promise<void>((resolve) => {
      watcher.once('ready', () => resolve());
    });
  }

  async stopStartupWatcher(): Promise<void> {
    if (!this.startupWatcher) return;
    await this.startupWatcher.close();
    this.startupWatcher = undefined;
    this.startupFileOffsets.clear();
    this.startupFileBuffers.clear();
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

    await this.db
      .insertInto('state_transitions')
      .values({ agent_key: agentKey, from_state: previous, to_state: 'error', ts })
      .execute();
    this.agentStateCache.set(agentKey, 'error');
    this.eventBus.publish({
      type: 'agent.state_changed',
      data: { key: agentKey, from: previous, to: 'error', ts },
    });
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

    await this.db
      .insertInto('state_transitions')
      .values({ agent_key: agentKey, from_state: previous, to_state: 'finished', ts })
      .execute();

    this.agentStateCache.set(agentKey, 'finished');
    this.eventBus.publish({
      type: 'agent.state_changed',
      data: { key: agentKey, from: previous, to: 'finished', ts },
    });
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

    await this.db
      .insertInto('state_transitions')
      .values({ agent_key: agentKey, from_state: 'running', to_state: 'pr_open', ts })
      .execute();

    this.agentStateCache.set(agentKey, 'pr_open');
    this.eventBus.publish({
      type: 'agent.state_changed',
      data: { key: agentKey, from: 'running', to: 'pr_open', ts },
    });
  }

  async ingestEvent(runId: number, event: TranscriptEvent): Promise<void> {
    const agentKey = await this.resolveAgentKey(runId);
    if (!agentKey) return;
    await this.processEvent({ runId, agentKey, event });
  }

  /**
   * Test seam — feeds a single event through the same code path the live
   * tail uses, but lets the caller supply `agentKey` directly instead of
   * resolving it from a real `runs` row. Used by the slice 1c unit tests
   * that exercise state-transition + SSE + PR-URL extraction without a
   * full attach lifecycle.
   */
  async processEventForTest(input: ProcessEventInput): Promise<void> {
    await this.processEvent(input);
  }

  /** Test seam — drives the same `lastRunIdCache` priming the live tail
   *  runs at attach. Used by the CREW-198 restart test to bypass tail
   *  timing without hand-wiring the cache. */
  async primeAgentForTest(agentKey: string): Promise<void> {
    await this.primeLastRunIdCacheForAgent(agentKey);
  }

  private async processEvent(input: ProcessEventInput): Promise<void> {
    const { event } = input;
    if (event.type === 'assistant') {
      await this.handleAssistantEvent({ ...input, event });
    } else if (event.type === 'user') {
      await this.handleUserEvent({ ...input, event });
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

    if (toolUse.name === 'Bash' && hasPrCreateInvocation(summary)) {
      this.pendingPrCreates.set(toolUse.id, { runId, agentKey });
    }

    this.eventBus.publish({ type: 'tool_calls.changed', data: { key: agentKey } });

    await this.applyStateTransition({
      agentKey,
      runId,
      toolName: toolUse.name,
      summary,
      tsIso: event.timestamp,
    });
  }

  private async handleUserEvent(input: {
    runId: number;
    agentKey: string;
    event: UserEvent;
  }): Promise<void> {
    const content = input.event.message.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (block.type !== 'tool_result') continue;
      // The user-content schema falls through to `unknownContentSchema` via
      // `.or(...)`, which fights TS's discriminated-union narrowing — assert
      // here once we've already proven `type === 'tool_result'`.
      const toolResult = block as ToolResultContent;
      const pending = this.pendingPrCreates.get(toolResult.tool_use_id);
      if (!pending) continue;
      this.pendingPrCreates.delete(toolResult.tool_use_id);

      const text = stringifyToolResultContent(toolResult.content);
      const match = PR_URL_REGEX.exec(text);
      if (!match) {
        this.logger.debug(
          {
            agentKey: pending.agentKey,
            runId: pending.runId,
            toolUseId: toolResult.tool_use_id,
          },
          'gh pr create tool_result had no PR URL',
        );
        continue;
      }

      await this.db
        .updateTable('agents')
        .set({ pr_url: match[0] })
        .where('key', '=', pending.agentKey)
        .execute();
    }
  }

  private async applyStateTransition(input: {
    agentKey: string;
    runId: number;
    toolName: string;
    summary: string;
    tsIso: string;
  }): Promise<void> {
    const previous = await this.getCachedAgentState(input.agentKey);
    const lastSeenRunId = this.lastRunIdCache.get(input.agentKey);
    const next = computeNextState(previous, input.toolName, input.summary, {
      currentRunId: input.runId,
      lastSeenRunId,
    });
    // Track the latest ingested run regardless of whether a transition fired;
    // subsequent same-run calls must not re-trigger the cycle.
    this.lastRunIdCache.set(input.agentKey, input.runId);
    if (next === previous) return;

    const ts = Date.parse(input.tsIso);
    if (!Number.isFinite(ts)) {
      this.logger.warn(
        { agentKey: input.agentKey, tsIso: input.tsIso },
        'unparseable timestamp; skipping state transition',
      );
      return;
    }

    await this.db
      .insertInto('state_transitions')
      .values({
        agent_key: input.agentKey,
        from_state: previous,
        to_state: next,
        ts,
      })
      .execute();

    this.agentStateCache.set(input.agentKey, next);
    this.eventBus.publish({
      type: 'agent.state_changed',
      data: { key: input.agentKey, from: previous, to: next, ts },
    });
  }

  private async getCachedAgentState(agentKey: string): Promise<TransitionState> {
    const cached = this.agentStateCache.get(agentKey);
    if (cached !== undefined) return cached;
    const latest = await this.db
      .selectFrom('state_transitions')
      .select('to_state')
      .where('agent_key', '=', agentKey)
      .orderBy('ts', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    const initial: TransitionState = isTransitionState(latest?.to_state) ? latest.to_state : 'init';
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
    // CREW-198: prime lastRunIdCache before the first event so a daemon
    // restart mid-fix-pr correctly detects the `pr_open → running` cycle on
    // the new run's first tool_call. Best-effort — a priming failure mustn't
    // crash the tail.
    try {
      const agentKey = await this.resolveAgentKey(runId);
      if (agentKey) await this.primeLastRunIdCacheForAgent(agentKey);
    } catch (err) {
      this.logger.warn({ err, runId, path }, 'lastRunIdCache prime failed');
    }
    for await (const event of tailTranscript(path, { signal })) {
      try {
        await this.ingestEvent(runId, event);
      } catch (err) {
        this.logger.warn({ err, runId, path }, 'ingestEvent failed');
      }
    }
  }

  /**
   * Seed `lastRunIdCache[agentKey]` from the most-recently-ingested tool_call
   * (across all of the agent's runs) so a fresh-process attach correctly
   * detects a subsequent new-run-id transition. No-op when the cache is
   * already populated (in-process state wins over DB read) or when the agent
   * has no prior tool_calls.
   */
  private async primeLastRunIdCacheForAgent(agentKey: string): Promise<void> {
    if (this.lastRunIdCache.has(agentKey)) return;
    const latest = await this.db
      .selectFrom('tool_calls')
      .innerJoin('runs', 'runs.id', 'tool_calls.run_id')
      .where('runs.agent_key', '=', agentKey)
      .select('tool_calls.run_id as lastRunId')
      .orderBy('tool_calls.occurred_at', 'desc')
      .orderBy('tool_calls.id', 'desc')
      .executeTakeFirst();
    if (latest) this.lastRunIdCache.set(agentKey, latest.lastRunId);
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

interface ComputeContext {
  /** The run_id of the tool_call currently being ingested. */
  currentRunId: number;
  /** The run_id of the most recently-ingested tool_call for this agent.
   *  Undefined when no tool_call has yet been ingested for this agent in
   *  the daemon's lifetime (cold start, pre-priming). */
  lastSeenRunId: number | undefined;
}

/**
 * Forward-walk one step in the live state machine. The slice 1b helper
 * `deriveStateFromToolCalls` re-derives state from a *full* tool-call slice;
 * here we only have the just-inserted call plus the cached previous state,
 * so we encode the same monotonic rule directly:
 *
 *   - any Bash `gh pr create …` → `pr_open` (and stays)
 *   - else, any tool_call once we were `init` → `running`
 *   - CREW-198: when in `pr_open` and the tool_call belongs to a NEW run
 *     (different `run_id` than the last-seen one), cycle back to `running`.
 *   - else, no flip
 *
 * The standalone helper stays the canonical re-derivation for the migration
 * backfill (CREW-96) and for any future "given a slice of N calls, what's
 * the state?" caller. A vitest assertion below pins the equivalence.
 */
function computeNextState(
  previous: TransitionState,
  toolName: string,
  summary: string,
  ctx: ComputeContext,
): TransitionState {
  if (previous === 'finished') return 'finished';
  // CREW-202: pr_merged is sticky against tool-call-driven transitions.
  // Only Finish (which writes 'finished') moves the agent out. Spec
  // marks "polling pr_merged agents to detect re-opens" out of scope.
  if (previous === 'pr_merged') return 'pr_merged';
  // CREW-198: a new run starting on a pr_open agent (e.g. crew fix-pr) cycles
  // state back to running. The `lastSeenRunId !== undefined` guard prevents
  // the first-ever tool_call from spuriously firing this transition.
  if (
    previous === 'pr_open' &&
    ctx.lastSeenRunId !== undefined &&
    ctx.currentRunId !== ctx.lastSeenRunId
  ) {
    return 'running';
  }
  if (previous === 'pr_open') return 'pr_open';
  if (toolName === 'Bash' && hasPrCreateInvocation(summary)) return 'pr_open';
  return 'running';
}

function isTransitionState(s: string | null | undefined): s is TransitionState {
  return (
    s === 'init' || s === 'running' || s === 'pr_open' || s === 'pr_merged' || s === 'finished'
  );
}

function stringifyToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (
          block !== null &&
          typeof block === 'object' &&
          'type' in block &&
          (block as { type?: unknown }).type === 'text'
        ) {
          const text = (block as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('\n');
  }
  return '';
}
