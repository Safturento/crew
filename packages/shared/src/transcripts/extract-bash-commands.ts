/**
 * Loose structural shape shared by the metric extractors. A transcript event
 * is parsed elsewhere into the rich `TranscriptEvent` union; the extractors
 * only reach for the tool_use items, so they accept this narrower interface
 * and tolerate any superset (including the full union).
 */
interface ToolUseItem {
  type: string;
  name?: string;
  input?: {
    command?: string;
    file_path?: string;
  };
}

interface ExtractableEvent {
  message?: {
    content?: ToolUseItem[] | string;
  };
}

/**
 * Pulls the `command` string from every `Bash` tool_use across a transcript,
 * in transcript order. Events without an array `content` (plain-string user
 * messages, envelopes with no message) contribute nothing.
 */
export function extractBashCommands(events: readonly ExtractableEvent[]): string[] {
  const out: string[] = [];
  for (const ev of events) {
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item.type === 'tool_use' && item.name === 'Bash' && item.input?.command) {
        out.push(item.input.command);
      }
    }
  }
  return out;
}
