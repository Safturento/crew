import type { AssistantEvent, TextContent, UserEvent } from 'crew-shared';

import { CardShell } from './CardShell.js';
import { formatLineTwo, truncate } from './utils.js';

interface TextCardProps {
  event: AssistantEvent | UserEvent;
  content: TextContent;
}

export function TextCard({ event, content }: TextCardProps) {
  const tokens = event.type === 'assistant' ? event.message.usage?.output_tokens : undefined;
  return (
    <CardShell
      lineOne={truncate(content.text)}
      lineTwo={formatLineTwo(event.timestamp, tokens)}
      expanded={content.text}
    />
  );
}
