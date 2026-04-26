import type { TranscriptEvent, ToolCall, AggregateUsage, ToolUseContent } from './types.js';

export function parseTranscript(raw: string): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as TranscriptEvent);
    } catch {
      // skip malformed lines
    }
  }
  return events;
}

export function parseToolCall(event: TranscriptEvent): ToolCall | null {
  if (event.type !== 'assistant') return null;
  const toolUse = event.message.content.find((c): c is ToolUseContent => c.type === 'tool_use');
  if (!toolUse) return null;
  return {
    name: toolUse.name,
    input: toolUse.input,
    timestamp: event.timestamp,
    outputTokens: event.message.usage.output_tokens,
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
    const u = event.message.usage;
    total.outputTokens += u.output_tokens;
    total.cacheReadTokens += u.cache_read_input_tokens;
    total.cacheCreationTokens += u.cache_creation_input_tokens;
    total.inputTokens += u.input_tokens;
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

function summarizeInput(toolName: string, input: Record<string, unknown>): string {
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
