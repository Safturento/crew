import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ToolResultContent, UserEvent } from 'crew-shared';

import { ToolResultCard } from './ToolResultCard.js';

const event: UserEvent = {
  type: 'user',
  uuid: 'evt-1',
  timestamp: '2026-04-29T14:32:18.000Z',
  message: {
    role: 'user',
    content: [],
  },
} as UserEvent;

const ok: ToolResultContent = {
  type: 'tool_result',
  tool_use_id: 'tu-9',
  content: 'PASS\n  Tests: 7 passed',
};

const err: ToolResultContent = {
  type: 'tool_result',
  tool_use_id: 'tu-10',
  content: 'ENOENT: no such file',
  is_error: true,
};

describe('ToolResultCard', () => {
  it('line 1 references the tool_use_id', () => {
    render(<ToolResultCard event={event} content={ok} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('result for tu-9');
  });

  it('line 1 is prefixed with [error] when is_error is true', () => {
    render(<ToolResultCard event={event} content={err} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[error]');
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('tu-10');
  });

  it('expand shows the full content', async () => {
    const user = userEvent.setup();
    render(<ToolResultCard event={event} content={ok} />);
    await user.click(screen.getByTestId('card-line-1'));
    expect(screen.getByTestId('card-expanded')).toHaveTextContent(/PASS/);
    expect(screen.getByTestId('card-expanded')).toHaveTextContent(/Tests: 7 passed/);
  });

  it('joins array content (Anthropic-style content blocks)', async () => {
    const user = userEvent.setup();
    const arr: ToolResultContent = {
      type: 'tool_result',
      tool_use_id: 'tu-11',
      content: [{ type: 'text', text: 'first chunk' }, 'second chunk'] as unknown[],
    };
    render(<ToolResultCard event={event} content={arr} />);
    await user.click(screen.getByTestId('card-line-1'));
    expect(screen.getByTestId('card-expanded')).toHaveTextContent('first chunk');
    expect(screen.getByTestId('card-expanded')).toHaveTextContent('second chunk');
  });
});
