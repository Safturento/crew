/** See `extract-bash-commands.ts` for why the extractors take a loose shape. */
interface ToolUseItem {
  type: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface ExtractableEvent {
  type?: string;
  message?: {
    content?: ToolUseItem[] | string;
  };
}

/**
 * Collects every distinct `file_path` opened by a `Read` tool_use across a
 * transcript. First-seen order is preserved; repeated reads of the same path
 * appear once.
 */
export function extractReadPaths(events: readonly ExtractableEvent[]): string[] {
  const seen = new Set<string>();
  for (const ev of events) {
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item.type !== 'tool_use' || item.name !== 'Read') continue;
      const filePath = item.input?.file_path;
      if (typeof filePath === 'string') seen.add(filePath);
    }
  }
  return Array.from(seen);
}
