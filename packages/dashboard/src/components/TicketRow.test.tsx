import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TicketRow } from './TicketRow.js';
import type { PickerTicket } from 'crew-shared';

const base: PickerTicket = {
  key: 'CREW-9',
  summary: 'A very long ticket summary that should wrap',
  priority: 'High',
  runnable: true,
  blockedBy: [],
  hasActiveAgent: false,
  interactive: false,
};

describe('TicketRow', () => {
  it('renders the title, key, and priority badge', () => {
    render(<TicketRow ticket={base} onSelect={vi.fn()} />);
    expect(screen.getByText(base.summary)).toBeInTheDocument();
    expect(screen.getByText('CREW-9')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('selects a runnable ticket on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TicketRow ticket={base} onSelect={onSelect} />);
    await user.click(screen.getByText(base.summary));
    expect(onSelect).toHaveBeenCalledWith(base);
  });

  it('disables and labels an interactive ticket, and does not call onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TicketRow ticket={{ ...base, interactive: true }} onSelect={onSelect} />);
    expect(screen.getByText('interactive')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    await user.click(screen.getByText(base.summary));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('disables an in-flight ticket and shows the running reason', () => {
    render(<TicketRow ticket={{ ...base, hasActiveAgent: true }} onSelect={vi.fn()} />);
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows the blocked reason with precedence over interactive and running', () => {
    render(
      <TicketRow
        ticket={{
          ...base,
          runnable: false,
          hasActiveAgent: true,
          interactive: true,
          blockedBy: [{ key: 'CREW-1', summary: 'x' }],
        }}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/blocked by CREW-1/)).toBeInTheDocument();
    expect(screen.queryByText('interactive')).not.toBeInTheDocument();
    expect(screen.queryByText('running')).not.toBeInTheDocument();
  });

  it('renders no reason for a plain runnable ticket', () => {
    render(<TicketRow ticket={base} onSelect={vi.fn()} />);
    expect(screen.queryByText('interactive')).not.toBeInTheDocument();
    expect(screen.queryByText('running')).not.toBeInTheDocument();
    expect(screen.queryByText(/blocked by/)).not.toBeInTheDocument();
  });
});
