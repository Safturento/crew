import type { ToolResultContent, UserEvent } from 'crew-shared';

import { CardShell } from './CardShell.js';
import { formatLineTwo, truncate } from './utils.js';

interface ToolResultCardProps {
  event: UserEvent;
  content: ToolResultContent;
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (
          c &&
          typeof c === 'object' &&
          'text' in c &&
          typeof (c as { text: unknown }).text === 'string'
        ) {
          return (c as { text: string }).text;
        }
        return JSON.stringify(c);
      })
      .join('\n');
  }
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

export function ToolResultCard({ event, content }: ToolResultCardProps) {
  const body = stringifyContent(content.content);
  const isError = content.is_error === true;
  const prefix = isError ? '[error] ' : '';
  return (
    <CardShell
      errorTone={isError}
      lineOne={`${prefix}[result for ${content.tool_use_id}] ${truncate(body)}`}
      lineTwo={formatLineTwo(event.timestamp)}
      expanded={body}
    />
  );
}
