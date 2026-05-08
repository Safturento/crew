import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TranscriptEvent, UnknownEvent } from 'crew-shared';

import { RawCard } from './RawCard.js';

describe('RawCard', () => {
  it('line 1 is "[unknown]" for an unknown event', () => {
    const event: UnknownEvent = {
      type: 'unknown',
      reason: 'unknown_top_level',
      raw: { type: 'mystery', payload: 42 },
      timestamp: '2026-04-29T14:32:17.000Z',
    } as UnknownEvent;
    render(<RawCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[unknown]');
  });

  it('expand pretty-prints the raw JSON', async () => {
    const user = userEvent.setup();
    const event: UnknownEvent = {
      type: 'unknown',
      reason: 'unknown_top_level',
      raw: { type: 'mystery', payload: 42 },
      timestamp: '2026-04-29T14:32:17.000Z',
    } as UnknownEvent;
    render(<RawCard event={event} />);
    await user.click(screen.getByTestId('card-line-1'));
    const text = screen.getByTestId('card-expanded').textContent ?? '';
    expect(text).toContain('"type": "mystery"');
    expect(text).toContain('"payload": 42');
  });

  it('renders for non-unknown variants too (catch-all fallback)', () => {
    const event = {
      type: 'last-prompt',
      timestamp: '2026-04-29T14:32:17.000Z',
      sessionId: 's-1',
      lastPrompt: 'hi',
    } as unknown as TranscriptEvent;
    render(<RawCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[last-prompt]');
  });
});
