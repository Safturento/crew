import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SystemEvent } from 'crew-shared';

import { SystemCard } from './SystemCard.js';

describe('SystemCard', () => {
  it('line 1 names the subtype', () => {
    const event = {
      type: 'system',
      subtype: 'turn_duration',
      timestamp: '2026-04-29T14:32:17.000Z',
      durationMs: 12_400,
    } as unknown as SystemEvent;
    render(<SystemCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[system/turn_duration]');
  });

  it('turn_duration body shows seconds with one decimal place', () => {
    const event = {
      type: 'system',
      subtype: 'turn_duration',
      timestamp: '2026-04-29T14:32:17.000Z',
      durationMs: 12_400,
    } as unknown as SystemEvent;
    render(<SystemCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('12.4s');
  });

  it('api_error body shows the error message on expand', async () => {
    const user = userEvent.setup();
    const event = {
      type: 'system',
      subtype: 'api_error',
      timestamp: '2026-04-29T14:32:17.000Z',
      error: { message: 'rate limited' },
    } as unknown as SystemEvent;
    render(<SystemCard event={event} />);
    await user.click(screen.getByTestId('card-line-1'));
    expect(screen.getByTestId('card-expanded')).toHaveTextContent('rate limited');
  });
});
