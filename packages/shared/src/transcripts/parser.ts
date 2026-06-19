import {
  KNOWN_ATTACHMENT_TYPES,
  KNOWN_SYSTEM_SUBTYPES,
  KNOWN_TOP_LEVEL_TYPES,
  baseEnvelopeSchema,
  transcriptEventSchema,
  type AssistantEvent,
  type ToolUseContent,
  type TranscriptEvent,
  type TextContent,
} from './schemas.js';
import type { AggregateUsage, AssistantText, ToolCall } from './types.js';

/**
 * Parse a single JSONL line into a typed transcript event.
 *
 * - Returns `null` only when `JSON.parse` itself fails (truncated or invalid
 *   JSON). Callers that want a per-file count of malformed lines can detect
 *   that here.
 * - Returns the `unknown` variant when the JSON parses but doesn't match any
 *   known schema. The `reason` records why we fell through so the daemon's
 *   ingest layer can log meaningfully.
 * - Never throws.
 */
export function parseTranscriptLine(line: string): TranscriptEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }

  const result = transcriptEventSchema.safeParse(json);
  if (result.success) return result.data;

  return constructUnknownEvent(json);
}

function constructUnknownEvent(json: unknown): TranscriptEvent {
  const raw = isRecord(json) ? json : {};
  const topType = typeof raw.type === 'string' ? raw.type : null;

  let reason: 'unknown_top_level' | 'unknown_subtype' | 'zod_failure' = 'unknown_top_level';
  if (topType && KNOWN_TOP_LEVEL_TYPES.has(topType)) {
    if (topType === 'system') {
      const subtype = raw.subtype;
      reason =
        typeof subtype === 'string' && KNOWN_SYSTEM_SUBTYPES.has(subtype)
          ? 'zod_failure'
          : 'unknown_subtype';
    } else if (topType === 'attachment') {
      const innerType = isRecord(raw.attachment) ? raw.attachment.type : undefined;
      reason =
        typeof innerType === 'string' && KNOWN_ATTACHMENT_TYPES.has(innerType)
          ? 'zod_failure'
          : 'unknown_subtype';
    } else {
      reason = 'zod_failure';
    }
  }

  const envelopeParse = baseEnvelopeSchema.safeParse(raw);
  const envelope = envelopeParse.success ? envelopeParse.data : {};

  return { ...envelope, type: 'unknown', raw, reason } as TranscriptEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse a multi-line JSONL transcript. Lines that fail JSON parsing are
 * skipped silently; lines whose shape doesn't match a known schema land as
 * `unknown` events so callers can still see them.
 */
export function parseTranscript(raw: string): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const event = parseTranscriptLine(line);
    if (event !== null) events.push(event);
  }
  return events;
}

export function parseToolCall(event: TranscriptEvent): ToolCall | null {
  if (event.type !== 'assistant') return null;
  const assistant = event as AssistantEvent;
  const toolUse = assistant.message.content.find((c): c is ToolUseContent => c.type === 'tool_use');
  if (!toolUse) return null;
  return {
    name: toolUse.name,
    input: toolUse.input,
    timestamp: assistant.timestamp,
    outputTokens: assistant.message.usage.output_tokens ?? 0,
  };
}

export function aggregateUsage(events: TranscriptEvent[]): AggregateUsage {
  const total: AggregateUsage = {
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    inputTokens: 0,
  };
  for (const event of events) {
    if (event.type !== 'assistant') continue;
    const u = (event as AssistantEvent).message.usage;
    total.outputTokens += u.output_tokens ?? 0;
    total.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    total.cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
    total.inputTokens += u.input_tokens ?? 0;
  }
  return total;
}

/**
 * Format a tool call as a single short line for the live stream. Mirrors the
 * bash watch-ticket.sh / run-ticket.sh formatting for parity.
 */
export function formatToolCall(call: ToolCall): string {
  const time = call.timestamp.replace(/^.*T/, '').replace(/\..*Z$/, '');
  const tokenLabel = formatTokens(call.outputTokens);
  const inputSummary = summarizeInput(call.name, call.input);
  return `${time}  [${call.name}][${tokenLabel}] ${inputSummary}`;
}

function formatTokens(n: number): string {
  if (n === 0) return '0 tok';
  if (n >= 10000) return `${Math.floor(n / 1000)}k tok`;
  if (n >= 1000) return `${(Math.floor((n * 10) / 1000) / 10).toString()}k tok`;
  return `${n} tok`;
}

const ASSISTANT_TEXT_MAX_LEN = 120;

export function parseAssistantText(event: TranscriptEvent): AssistantText | null {
  if (event.type !== 'assistant') return null;
  const assistant = event as AssistantEvent;
  const textBlock = assistant.message.content.find((c): c is TextContent => c.type === 'text');
  if (!textBlock) return null;
  if (!textBlock.text.trim()) return null;
  return { text: textBlock.text, timestamp: assistant.timestamp };
}

export function formatAssistantText(text: AssistantText): string {
  const time = text.timestamp.replace(/^.*T/, '').replace(/\..*Z$/, '');
  const oneLine = text.text
    .replace(/\r?\n+/g, ' ⏎ ')
    .replace(/\s+/g, ' ')
    .trim();
  const snippet =
    oneLine.length > ASSISTANT_TEXT_MAX_LEN
      ? `${oneLine.slice(0, ASSISTANT_TEXT_MAX_LEN)}…`
      : oneLine;
  return `${time}  · ${snippet}`;
}

export function summarizeInput(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return String(input.file_path ?? '?');
    case 'Bash':
      return String(input.command ?? '')
        .replace(/\n/g, ' ⏎ ')
        .slice(0, 140);
    case 'Glob':
      return `${String(input.pattern ?? '?')}  in  ${String(input.path ?? '.')}`;
    case 'Grep':
      return `/${String(input.pattern ?? '?')}/  in  ${String(input.path ?? '.')}`;
    default:
      return JSON.stringify(input).slice(0, 120);
  }
}

/**
 * True when `text` contains a `gh pr create` invocation at the start of any
 * line — the signal that drives the `running → pr_open` state transition.
 *
 * Accepts either a raw Bash command (newlines as `\n`) or a `summarizeInput`
 * summary (newlines rendered as ` ⏎ `), so the daemon's ingest path, metrics
 * path, and state re-derivation can all share one predicate. A plain
 * substring match is deliberately avoided: agents prefix the PR command with
 * `cd <worktree>` (or chain `git push && …`) so it is rarely the first token,
 * yet `echo "… gh pr create …"` must NOT count. Per-line "starts with"
 * satisfies both. As of CREW-257 the daemon no longer infers state from the
 * transcript; the sole remaining consumer is the tool-call re-derivation
 * (`state-derivation.ts` `deriveStateFromToolCalls`), kept only for the
 * forward-only CREW-96 backfill of pre-cutover agents.
 */
export function hasPrCreateInvocation(text: string | null | undefined): boolean {
  if (!text) return false;
  return text.split(/\n|⏎/).some((line) => line.trimStart().startsWith('gh pr create'));
}
