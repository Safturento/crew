import { join } from 'node:path';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import {
  claudeProjectDirFor,
  parseToolCall,
  summarizeInput,
  tailTranscript,
  type TranscriptEvent,
} from 'crew-shared';
import type { DaemonDatabase } from '../db.js';

export interface IngestServiceDeps {
  db: Kysely<DaemonDatabase>;
  logger: Logger;
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
 * - PR URL extraction is deferred to slice 1c — `pr_url` stays NULL.
 */
export class IngestService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly logger: Logger;
  private readonly tails = new Map<number, AbortController>();

  constructor(deps: IngestServiceDeps) {
    this.db = deps.db;
    this.logger = deps.logger;
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
        'agents.worktree_path as worktreePath',
      ])
      .where('runs.completed_at', 'is', null)
      .execute();
    const resolve = opts.resolveJsonlPath ?? defaultResolveJsonlPath;
    for (const row of open) {
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
  }

  async ingestEvent(runId: number, event: TranscriptEvent): Promise<void> {
    if (event.type !== 'assistant') return;
    const call = parseToolCall(event);
    if (!call) return;
    const usage = event.message.usage;
    await this.db
      .insertInto('tool_calls')
      .values({
        run_id: runId,
        tool_name: call.name,
        input_summary: summarizeInput(call.name, call.input),
        output_tokens: usage.output_tokens,
        input_tokens: usage.input_tokens,
        cache_read_tokens: usage.cache_read_input_tokens,
        cache_creation_tokens: usage.cache_creation_input_tokens,
        occurred_at: call.timestamp,
      })
      .onConflict((oc) => oc.columns(['run_id', 'occurred_at', 'tool_name']).doNothing())
      .execute();
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
