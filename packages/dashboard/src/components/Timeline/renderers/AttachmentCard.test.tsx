import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AttachmentEvent } from 'crew-shared';

import { AttachmentCard } from './AttachmentCard.js';

describe('AttachmentCard', () => {
  it('line 1 names the attachment type', () => {
    const event = {
      type: 'attachment',
      timestamp: '2026-04-29T14:32:17.000Z',
      attachment: {
        type: 'hook_success',
        hookName: 'pre-commit',
        toolUseID: 'tu-3',
      },
    } as unknown as AttachmentEvent;
    render(<AttachmentCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[hook_success]');
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('pre-commit');
  });

  it('queued_command line 1 shows the queued prompt', () => {
    const event = {
      type: 'attachment',
      timestamp: '2026-04-29T14:32:17.000Z',
      attachment: {
        type: 'queued_command',
        prompt: 'do the thing',
      },
    } as unknown as AttachmentEvent;
    render(<AttachmentCard event={event} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[queued_command]');
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('do the thing');
  });

  it('expand pretty-prints the attachment JSON', async () => {
    const user = userEvent.setup();
    const event = {
      type: 'attachment',
      timestamp: '2026-04-29T14:32:17.000Z',
      attachment: {
        type: 'queued_command',
        prompt: 'do the thing',
      },
    } as unknown as AttachmentEvent;
    render(<AttachmentCard event={event} />);
    await user.click(screen.getByTestId('card-line-1'));
    expect(screen.getByTestId('card-expanded')).toHaveTextContent('queued_command');
    expect(screen.getByTestId('card-expanded')).toHaveTextContent('do the thing');
  });
});
