import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  AssistantEvent,
  AttachmentEvent,
  SystemEvent,
  TranscriptEvent,
  UnknownEvent,
  UserEvent,
} from 'crew-shared';

import { EventCard } from './EventCard.js';

const ts = '2026-04-29T14:32:17.000Z';

describe('EventCard', () => {
  it('dispatches assistant tool_use content to ToolUseCard', () => {
    const event: AssistantEvent = {
      type: 'assistant',
      timestamp: ts,
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls' } }],
        usage: { output_tokens: 0 },
      },
    } as AssistantEvent;
    render(<EventCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[Bash] ls');
  });

  it('dispatches assistant thinking content to ThinkingCard', () => {
    const event: AssistantEvent = {
      type: 'assistant',
      timestamp: ts,
      message: {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'pondering things' }],
        usage: { output_tokens: 0 },
      },
    } as AssistantEvent;
    render(<EventCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[thinking]');
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('pondering things');
  });

  it('dispatches assistant text content to TextCard', () => {
    const event: AssistantEvent = {
      type: 'assistant',
      timestamp: ts,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello world' }],
        usage: { output_tokens: 0 },
      },
    } as AssistantEvent;
    render(<EventCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('hello world');
  });

  it('dispatches user tool_result content to ToolResultCard', () => {
    const event: UserEvent = {
      type: 'user',
      timestamp: ts,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu-9', content: 'ok' }],
      },
    } as UserEvent;
    render(<EventCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('result for tu-9');
  });

  it('dispatches user text content to TextCard', () => {
    const event: UserEvent = {
      type: 'user',
      timestamp: ts,
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'a user message' }],
      },
    } as UserEvent;
    render(<EventCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('a user message');
  });

  it('dispatches system events to SystemCard', () => {
    const event = {
      type: 'system',
      subtype: 'turn_duration',
      timestamp: ts,
      durationMs: 9_500,
    } as unknown as SystemEvent;
    render(<EventCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[system/turn_duration]');
  });

  it('dispatches attachment events to AttachmentCard', () => {
    const event = {
      type: 'attachment',
      timestamp: ts,
      attachment: { type: 'queued_command', prompt: 'go' },
    } as unknown as AttachmentEvent;
    render(<EventCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[queued_command]');
  });

  it('dispatches unknown events to RawCard', () => {
    const event: UnknownEvent = {
      type: 'unknown',
      reason: 'unknown_top_level',
      raw: { type: 'whatever' },
      timestamp: ts,
    } as UnknownEvent;
    render(<EventCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[unknown]');
  });

  it('falls back to RawCard for non-mapped top-level types', () => {
    const event = {
      type: 'last-prompt',
      timestamp: ts,
      sessionId: 's-1',
      lastPrompt: 'hi',
    } as unknown as TranscriptEvent;
    render(<EventCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[last-prompt]');
  });

  it('renders one card per content block in an assistant message', () => {
    const event: AssistantEvent = {
      type: 'assistant',
      timestamp: ts,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'first' },
          { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls' } },
          { type: 'text', text: 'done' },
        ],
        usage: { output_tokens: 0 },
      },
    } as AssistantEvent;
    render(<EventCard event={event} />);
    expect(screen.getAllByTestId('card-line-1')).toHaveLength(3);
  });

  it('treats user.message.content as text when it is a plain string', () => {
    const event = {
      type: 'user',
      timestamp: ts,
      message: { role: 'user', content: 'string body' },
    } as unknown as UserEvent;
    render(<EventCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('string body');
  });
});
