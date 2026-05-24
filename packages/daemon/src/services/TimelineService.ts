import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import { parseTranscriptLine, type TranscriptEvent } from 'crew-shared';

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

    const path = await this.deps.resolveJsonlPath(agentKey);
    if (!path) {
      // Transcript missing is non-terminal: startup events may still
      // exist (e.g. an agent stuck in `initializing` because docker
      // bringup is in flight). Surface them so the drawer is useful.
      return {
        events: startupRows,
        warnings: startupRows.length === 0 ? ['transcript-missing'] : [],
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
        return {
          events: startupRows,
          warnings: startupRows.length === 0 ? ['transcript-missing'] : [],
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
    // so we keep the two streams as-is and concatenate.
    const events = [...startupRows, ...transcriptEvents];
    return { events, warnings: [] };
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
