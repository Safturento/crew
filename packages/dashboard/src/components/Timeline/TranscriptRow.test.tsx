import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type {
  AssistantEvent,
  AttachmentEvent,
  SystemEvent,
  TranscriptEvent,
  UnknownEvent,
  UserEvent,
} from 'crew-shared';

import { TranscriptRow } from './TranscriptRow.js';

const ts = '2026-04-29T14:32:17.000Z';

function rows() {
  return screen.getAllByTestId('transcript-row');
}

describe('TranscriptRow', () => {
  describe('tools category', () => {
    it('renders an assistant tool_use as one row tagged with the tool name', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'npm test' } },
          ],
          usage: { output_tokens: 180 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-block-type', 'tool_use');
      expect(row).toHaveAttribute('data-category', 'tools');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Bash');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('npm test');
      expect(screen.getByTestId('transcript-row-meta')).toHaveTextContent('14:32:17');
      expect(screen.getByTestId('transcript-row-meta')).toHaveTextContent('180 tok');
    });

    it('renders a user tool_result as one row tagged "Result"', () => {
      const event: UserEvent = {
        type: 'user',
        timestamp: ts,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-9', content: 'ok' }],
        },
      } as UserEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-block-type', 'tool_result');
      expect(row).toHaveAttribute('data-category', 'tools');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Result');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('ok');
    });

    it('error tool_result raises the row tag to the error colour', () => {
      const event: UserEvent = {
        type: 'user',
        timestamp: ts,
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu-1', content: 'boom', is_error: true },
          ],
        },
      } as UserEvent;
      render(<TranscriptRow event={event} />);
      expect(screen.getByTestId('transcript-row')).toHaveAttribute('data-tone', 'error');
    });
  });

  describe('conversation category', () => {
    it('renders an assistant text block tagged "Assistant"', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hello world' }],
          usage: { output_tokens: 5 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-category', 'conversation');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Assistant');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('hello world');
    });

    it('renders a user text block tagged "User"', () => {
      const event: UserEvent = {
        type: 'user',
        timestamp: ts,
        message: { role: 'user', content: [{ type: 'text', text: 'do it' }] },
      } as UserEvent;
      render(<TranscriptRow event={event} />);
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('User');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('do it');
    });

    it('treats a bare-string user message as a single conversation row', () => {
      const event = {
        type: 'user',
        timestamp: ts,
        message: { role: 'user', content: 'fix the build' },
      } as unknown as UserEvent;
      render(<TranscriptRow event={event} />);
      expect(rows()).toHaveLength(1);
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('User');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('fix the build');
    });
  });

  describe('thinking category', () => {
    it('renders a thinking block tagged "Thinking"', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'first I would …' }],
          usage: { output_tokens: 12 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-category', 'thinking');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Thinking');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('first I would');
    });
  });

  describe('hooks-and-skills category', () => {
    it('renders a hook attachment tagged with the hook subtype', () => {
      const event = {
        type: 'attachment',
        timestamp: ts,
        attachment: { type: 'hook_success', hookName: 'pre-commit' },
      } as unknown as AttachmentEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-category', 'hooks-and-skills');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('hook_success');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('pre-commit');
    });
  });

  describe('system category', () => {
    it('renders a system event tagged with its subtype', () => {
      const event = {
        type: 'system',
        subtype: 'turn_duration',
        timestamp: ts,
        durationMs: 8_500,
        messageCount: 4,
      } as unknown as SystemEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-category', 'system');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('turn_duration');
    });
  });

  describe('multi-block events', () => {
    it('renders one row per content block in an assistant message', () => {
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
          usage: { output_tokens: 9 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      expect(rows()).toHaveLength(3);
      const tags = screen.getAllByTestId('transcript-row-tag').map((n) => n.textContent);
      expect(tags).toEqual(['Thinking', 'Bash', 'Assistant']);
    });
  });

  describe('unknown / raw blocks', () => {
    it('renders an unknown event as a single "unknown" row', () => {
      const event: UnknownEvent = {
        type: 'unknown',
        reason: 'unknown_top_level',
        raw: { type: 'whatever' },
        timestamp: ts,
      } as UnknownEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-block-type', 'unknown');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('unknown');
    });

    it('renders an unrecognised content block as its own row, not the whole event', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'visible-text' },
            { type: 'mystery_block', payload: 99 } as unknown as never,
          ],
          usage: { output_tokens: 0 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      expect(rows()).toHaveLength(2);
      const tags = screen.getAllByTestId('transcript-row-tag').map((n) => n.textContent);
      expect(tags).toEqual(['Assistant', 'mystery_block']);
    });

    it('falls back to a single row for non-mapped top-level event types', () => {
      const event = {
        type: 'last-prompt',
        timestamp: ts,
        sessionId: 's-1',
        lastPrompt: 'hi',
      } as unknown as TranscriptEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-block-type', 'last-prompt');
    });
  });

  describe('row expansion', () => {
    it('does not show the expanded view by default', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'npm test' } },
          ],
          usage: { output_tokens: 5 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      expect(screen.queryByTestId('transcript-row-expanded')).toBeNull();
    });

    it('clicking the row expands to show the underlying JSON / full text', async () => {
      const user = userEvent.setup();
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tu-1',
              name: 'Bash',
              input: { command: 'npm test', description: 'Run tests' },
            },
          ],
          usage: { output_tokens: 5 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      await user.click(screen.getByTestId('transcript-row-trigger'));
      expect(screen.getByTestId('transcript-row-expanded')).toHaveTextContent('npm test');
      expect(screen.getByTestId('transcript-row-expanded')).toHaveTextContent('Run tests');
    });
  });

  describe('a11y', () => {
    it('exposes a descriptive aria-label including the tag + one-liner', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'npm test' } },
          ],
          usage: { output_tokens: 0 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const trigger = screen.getByTestId('transcript-row-trigger');
      expect(trigger).toHaveAttribute('aria-label', expect.stringContaining('Bash'));
      expect(trigger).toHaveAttribute('aria-label', expect.stringContaining('npm test'));
    });
  });
});
