import type { AssistantEvent, ThinkingContent } from 'crew-shared';

import { CardShell } from './CardShell.js';
import { formatLineTwo, truncate } from './utils.js';

interface ThinkingCardProps {
  event: AssistantEvent;
  content: ThinkingContent;
}

export function ThinkingCard({ event, content }: ThinkingCardProps) {
  return (
    <CardShell
      lineOne={`[thinking] ${truncate(content.thinking)}`}
      lineTwo={formatLineTwo(event.timestamp, event.message.usage?.output_tokens)}
      expanded={content.thinking}
    />
  );
}
