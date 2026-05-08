import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AssistantEvent, ThinkingContent } from 'crew-shared';

import { ThinkingCard } from './ThinkingCard.js';

const longThought = 'a'.repeat(200);

const event: AssistantEvent = {
  type: 'assistant',
  uuid: 'evt-1',
  timestamp: '2026-04-29T14:32:17.000Z',
  message: {
    role: 'assistant',
    content: [],
    usage: { output_tokens: 0 },
  },
} as AssistantEvent;

const content: ThinkingContent = {
  type: 'thinking',
  thinking: longThought,
};

describe('ThinkingCard', () => {
  it('line 1 is the first ~80 chars of thinking with a [thinking] prefix', () => {
    render(<ThinkingCard event={event} content={content} />);
    const line1 = screen.getByTestId('card-line-1').textContent ?? '';
    expect(line1.startsWith('[thinking]')).toBe(true);
    expect(line1.length).toBeLessThan(110);
  });

  it('expand shows the full prose', async () => {
    const user = userEvent.setup();
    render(<ThinkingCard event={event} content={content} />);
    await user.click(screen.getByTestId('card-line-1'));
    expect(screen.getByTestId('card-expanded')).toHaveTextContent(longThought);
  });
});
