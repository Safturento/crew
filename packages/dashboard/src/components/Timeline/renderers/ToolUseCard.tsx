import type { AssistantEvent, ToolUseContent } from 'crew-shared';

import { CardShell } from './CardShell.js';
import { formatLineTwo, summarizeToolInput, truncate } from './utils.js';

interface ToolUseCardProps {
  event: AssistantEvent;
  content: ToolUseContent;
}

export function ToolUseCard({ event, content }: ToolUseCardProps) {
  const summary = truncate(summarizeToolInput(content.input));
  const tokens = event.message.usage?.output_tokens;
  return (
    <CardShell
      lineOne={`[${content.name}] ${summary}`}
      lineTwo={formatLineTwo(event.timestamp, tokens)}
      expanded={JSON.stringify(content.input, null, 2)}
    />
  );
}
