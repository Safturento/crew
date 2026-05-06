import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Logger } from 'pino';
import { parseTranscriptLine, type TranscriptEvent } from 'crew-shared';

export interface TimelineDeps {
  /**
   * Resolve an agent key to the absolute path of its latest run's JSONL
   * transcript. Return `null` when no run exists for the key — the caller
   * surfaces a `transcript-missing` warning rather than 404, mirroring the
   * spec's "graceful missing-file" path.
   */
  resolveJsonlPath: (agentKey: string) => Promise<string | null>;
  logger?: Logger;
}

export interface TimelineResult {
  events: TranscriptEvent[];
  warnings: ('transcript-missing' | 'transcript-malformed-lines')[];
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
    const path = await this.deps.resolveJsonlPath(agentKey);
    if (!path) return { events: [], warnings: ['transcript-missing'] };

    const events: TranscriptEvent[] = [];
    let malformed = 0;
    try {
      const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        const evt = parseTranscriptLine(line);
        if (evt) events.push(evt);
        else malformed += 1;
      }
    } catch (err) {
      if (isEnoent(err)) return { events: [], warnings: ['transcript-missing'] };
      throw err;
    }

    if (malformed > 0) {
      this.deps.logger?.warn({ agentKey, path, malformed }, 'timeline: malformed jsonl lines skipped');
    }
    return { events, warnings: [] };
  }
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT';
}
