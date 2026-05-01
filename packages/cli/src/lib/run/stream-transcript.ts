import { formatToolCall, parseToolCall, tailTranscript } from 'crew-shared';
import { findNewestTranscript } from './discover-transcript.js';

export interface StreamTranscriptOptions {
  /**
   * Path to the JSONL transcript to tail. Either this or `projectDir` must be
   * provided. When both are set, `transcriptPath` wins.
   */
  transcriptPath?: string;
  /**
   * Claude Code project directory (e.g. `~/.claude/projects/<encoded-cwd>`)
   * to poll for the newest `.jsonl`. Use this when the transcript path is
   * not yet known — i.e. fresh `claude` spawns.
   */
  projectDir?: string;
  /**
   * Aborted to terminate the loop. The tail generator does one final drain
   * pass after abort so trailing events written just before the subprocess
   * exits are still emitted.
   */
  signal: AbortSignal;
  /**
   * Forwarded to `tailTranscript`. Use `true` when resuming an existing
   * Claude session whose transcript already contains prior history that
   * shouldn't be re-rendered.
   */
  startAtEnd?: boolean;
  /**
   * Where to write each formatted tool-call line (with a trailing `\n`).
   * Defaults to `process.stdout`.
   */
  out?: NodeJS.WritableStream;
  /** Forwarded to `findNewestTranscript` and `tailTranscript`. */
  pollMs?: number;
}

export interface StreamTranscriptResult {
  /**
   * The transcript path that was tailed. `null` only when discovery via
   * `projectDir` aborted before any `.jsonl` appeared (e.g. claude crashed
   * before writing one).
   */
  transcriptPath: string | null;
}

/**
 * Spawn-to-stream-end glue shared by `runRun`, `runFixPr`, and `runResume`:
 * resolve a transcript path (either passed in or discovered), tail it,
 * parse each event as a tool call, and write the formatted line to `out`.
 *
 * Pre-spawn logging and post-stream footers stay in the caller — they
 * differ per command. Three near-identical inline copies of this loop is
 * what the helper exists to prevent.
 */
export async function streamTranscript(
  opts: StreamTranscriptOptions,
): Promise<StreamTranscriptResult> {
  if (!opts.transcriptPath && !opts.projectDir) {
    throw new Error('streamTranscript requires either transcriptPath or projectDir');
  }
  const out = opts.out ?? process.stdout;

  let transcriptPath: string | null = opts.transcriptPath ?? null;
  if (!transcriptPath && opts.projectDir) {
    transcriptPath = await findNewestTranscript(opts.projectDir, {
      signal: opts.signal,
      pollMs: opts.pollMs,
    });
  }
  if (!transcriptPath) return { transcriptPath: null };

  for await (const event of tailTranscript(transcriptPath, {
    signal: opts.signal,
    startAtEnd: opts.startAtEnd,
    pollMs: opts.pollMs,
  })) {
    const call = parseToolCall(event);
    if (call) out.write(`${formatToolCall(call)}\n`);
  }

  return { transcriptPath };
}
