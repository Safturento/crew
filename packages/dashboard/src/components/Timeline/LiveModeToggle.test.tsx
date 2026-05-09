import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LiveModeToggle, NewEventsPill } from './LiveModeToggle.js';

describe('LiveModeToggle', () => {
  it('renders a switch labelled "Live"', () => {
    render(<LiveModeToggle active={true} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: /live/i })).toBeInTheDocument();
  });

  it('reflects the active state via aria-checked', () => {
    const { rerender } = render(<LiveModeToggle active={true} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: /live/i })).toHaveAttribute('aria-checked', 'true');
    rerender(<LiveModeToggle active={false} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: /live/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking the switch fires onChange with the negated value', async () => {
    const onChange = vi.fn();
    render(<LiveModeToggle active={true} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: /live/i }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('NewEventsPill', () => {
  it('renders the count and an arrow', () => {
    render(<NewEventsPill count={5} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /5 new events/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5 new events/i })).toHaveTextContent('↓');
  });

  it('clicking fires onClick', async () => {
    const onClick = vi.fn();
    render(<NewEventsPill count={3} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: /3 new events/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
