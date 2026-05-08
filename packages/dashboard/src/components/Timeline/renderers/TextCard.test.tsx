import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AssistantEvent, TextContent } from 'crew-shared';

import { TextCard } from './TextCard.js';

const longText = 'b'.repeat(200);

const event: AssistantEvent = {
  type: 'assistant',
  uuid: 'evt-1',
  timestamp: '2026-04-29T14:32:17.000Z',
  message: {
    role: 'assistant',
    content: [],
    usage: { output_tokens: 256 },
  },
} as AssistantEvent;

const content: TextContent = { type: 'text', text: longText };

describe('TextCard', () => {
  it('line 1 truncates the text to ~80 chars', () => {
    render(<TextCard event={event} content={content} />);
    const line1 = screen.getByTestId('card-line-1').textContent ?? '';
    expect(line1.length).toBeLessThan(110);
    expect(line1).toContain('bbb');
  });

  it('expand shows the full text', async () => {
    const user = userEvent.setup();
    render(<TextCard event={event} content={content} />);
    await user.click(screen.getByTestId('card-line-1'));
    expect(screen.getByTestId('card-expanded')).toHaveTextContent(longText);
  });
});
