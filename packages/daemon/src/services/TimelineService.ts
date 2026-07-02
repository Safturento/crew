import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import {
  parseTranscriptLine,
  type SystemFailedStartEvent,
  type TranscriptEvent,
} from 'crew-shared';

import type { DaemonDatabase } from '../db.js';
import { mergeStartedAndCompleted } from './startup-events-merge.js';

export interface TimelineDeps {
  /**
   * Resolve an agent key to the absolute path of its latest run's JSONL
   * transcript. Return `null` when no run exists for the key — the caller
   * surfaces a `transcript-missing` warning rather than 404, mirroring the
   * spec's "graceful missing-file" path.
   */
  resolveJsonlPath: (agentKey: string) => Promise<string | null>;
  logger?: Logger;
  /**
   * When provided, the timeline also surfaces CREW-201 startup phase
   * rows merged from the `startup_events` table. Optional so unit tests
   * that only exercise the JSONL path don't need to spin up a DB.
   */
  db?: Kysely<DaemonDatabase>;
}

export type TimelineWarning = 'transcript-missing';

export interface TimelineResult {
  events: TranscriptEvent[];
  warnings: TimelineWarning[];
}

/**
 * Re-parses an agent's JSONL transcript on demand using `crew-shared`'s
 * line parser. Streams the file with `createReadStream` + `readline` so
 * long timelines never get fully buffered into memory. The dashboard
 * virtualizes long timelines client-side; server-side pagination is a
 * deferred optimization tracked in the slice 1c plan.
 */
export class TimelineService {
  constructor(private readonly deps: TimelineDeps) {}

  async getTimeline(agentKey: string): Promise<TimelineResult> {
    const startupRows = await this.readStartupPhaseRows(agentKey);
    // CREW-313: the latest structured `failed-start` run's diagnosis, rendered
    // as a synthetic terminal event. It is the safety net for any death path
    // whose reason reached the `runs` row but never a startup `failed` phase
    // (e.g. a `PreflightError` intercepted by `runTrackedPreflight`). Empty
    // array when there's no such row, so it concatenates transparently.
    const failedStart = await this.readFailedStartEvent(agentKey);
    const trailing: TranscriptEvent[] = failedStart ? [failedStart] : [];

    const path = await this.deps.resolveJsonlPath(agentKey);
    if (!path) {
      // Transcript missing is non-terminal: startup events (or a failed-start
      // diagnosis) may still exist (e.g. a preflight death that never spawned
      // claude). Surface them so the drawer is useful.
      const events = [...startupRows, ...trailing];
      return {
        events,
        warnings: events.length === 0 ? ['transcript-missing'] : [],
      };
    }

    const transcriptEvents: TranscriptEvent[] = [];
    let malformed = 0;
    try {
      const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        const evt = parseTranscriptLine(line);
        if (evt) transcriptEvents.push(evt);
        else malformed += 1;
      }
    } catch (err) {
      if (isEnoent(err)) {
        const events = [...startupRows, ...trailing];
        return {
          events,
          warnings: events.length === 0 ? ['transcript-missing'] : [],
        };
      }
      throw err;
    }

    if (malformed > 0) {
      this.deps.logger?.warn(
        { agentKey, path, malformed },
        'timeline: malformed jsonl lines skipped',
      );
    }

    // CREW-201: startup phase rows come BEFORE transcript events (CLI
    // emits them at preflight/bringup time, well before claude's first
    // tool_use). The transcript already has its own internal ordering,
    // so we keep the two streams as-is and concatenate. CREW-313: the
    // failed-start event is appended LAST — it is the terminal reason the
    // dispatch never produced a running agent.
    const events = [...startupRows, ...transcriptEvents, ...trailing];
    return { events, warnings: [] };
  }

  /**
   * CREW-313: build a synthetic `crew_failed_start` event from the latest
   * `failed-start` run for the agent. Returns `null` when no DB is wired, no
   * failed-start row exists, or (defensively) the row carries no diagnosis at
   * all — never an event full of empty strings for a partially-written row.
   */
  private async readFailedStartEvent(agentKey: string): Promise<SystemFailedStartEvent | null> {
    const db = this.deps.db;
    if (!db) return null;
    const row = await db
      .selectFrom('runs')
      .select([
        'failure_check',
        'failure_headline',
        'failure_remediation',
        'failure_output',
        'started_at',
        'completed_at',
      ])
      .where('agent_key', '=', agentKey)
      .where('status', '=', 'failed-start')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (!row) return null;
    if (
      row.failure_check === null &&
      row.failure_headline === null &&
      row.failure_remediation === null &&
      row.failure_output === null
    ) {
      return null;
    }
    return {
      type: 'system',
      subtype: 'crew_failed_start',
      timestamp: row.completed_at ?? row.started_at,
      check: row.failure_check ?? '',
      headline: row.failure_headline ?? '',
      remediation: row.failure_remediation ?? '',
      output: row.failure_output ?? '',
    };
  }

  /** CREW-201: read merged startup phase rows for an agent. Returns an
   *  empty array when no DB is wired or the agent has no startup events. */
  private async readStartupPhaseRows(agentKey: string): Promise<TranscriptEvent[]> {
    const db = this.deps.db;
    if (!db) return [];
    const rows = await db
      .selectFrom('startup_events')
      .selectAll()
      .where('agent_key', '=', agentKey)
      .orderBy('ts', 'asc')
      .execute();
    return mergeStartedAndCompleted(rows);
  }
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT';
}
