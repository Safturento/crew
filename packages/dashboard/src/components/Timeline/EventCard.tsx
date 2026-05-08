import type {
  AssistantContent,
  AssistantEvent,
  TextContent,
  ThinkingContent,
  ToolResultContent,
  ToolUseContent,
  TranscriptEvent,
  UserContent,
  UserEvent,
} from 'crew-shared';

import { AttachmentCard } from './renderers/AttachmentCard.js';
import { RawCard } from './renderers/RawCard.js';
import { SystemCard } from './renderers/SystemCard.js';
import { TextCard } from './renderers/TextCard.js';
import { ThinkingCard } from './renderers/ThinkingCard.js';
import { ToolResultCard } from './renderers/ToolResultCard.js';
import { ToolUseCard } from './renderers/ToolUseCard.js';

function isToolUse(c: AssistantContent | UserContent): c is ToolUseContent {
  if (c.type !== 'tool_use') return false;
  const r = c as Record<string, unknown>;
  return (
    typeof r.name === 'string' &&
    typeof r.id === 'string' &&
    typeof r.input === 'object' &&
    r.input !== null
  );
}

function isThinking(c: AssistantContent): c is ThinkingContent {
  return c.type === 'thinking' && typeof (c as { thinking: unknown }).thinking === 'string';
}

function isText(c: AssistantContent | UserContent): c is TextContent {
  return c.type === 'text' && typeof (c as { text: unknown }).text === 'string';
}

function isToolResult(c: UserContent): c is ToolResultContent {
  return (
    c.type === 'tool_result' && typeof (c as { tool_use_id: unknown }).tool_use_id === 'string'
  );
}

interface EventCardProps {
  event: TranscriptEvent;
}

export function EventCard({ event }: EventCardProps) {
  switch (event.type) {
    case 'assistant':
      return <AssistantContentCards event={event} />;
    case 'user':
      return <UserContentCards event={event} />;
    case 'system':
      return <SystemCard event={event} />;
    case 'attachment':
      return <AttachmentCard event={event} />;
    default:
      return <RawCard event={event} />;
  }
}

function AssistantContentCards({ event }: { event: AssistantEvent }) {
  return (
    <>
      {event.message.content.map((content, idx) => (
        <AssistantBlock key={idx} event={event} content={content} />
      ))}
    </>
  );
}

function AssistantBlock({ event, content }: { event: AssistantEvent; content: AssistantContent }) {
  if (isToolUse(content)) return <ToolUseCard event={event} content={content} />;
  if (isThinking(content)) return <ThinkingCard event={event} content={content} />;
  if (isText(content)) return <TextCard event={event} content={content} />;
  return <RawCard event={event} block={content} />;
}

function UserContentCards({ event }: { event: UserEvent }) {
  const raw = event.message.content;
  if (typeof raw === 'string') {
    return <TextCard event={event} content={{ type: 'text', text: raw }} />;
  }
  return (
    <>
      {raw.map((content, idx) => (
        <UserBlock key={idx} event={event} content={content} />
      ))}
    </>
  );
}

function UserBlock({ event, content }: { event: UserEvent; content: UserContent }) {
  if (isToolResult(content)) return <ToolResultCard event={event} content={content} />;
  if (isText(content)) return <TextCard event={event} content={content} />;
  return <RawCard event={event} block={content} />;
}
