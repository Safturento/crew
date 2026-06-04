import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LiveModeToggle } from './LiveModeToggle.js';

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

  it('is built on the design-system Switch primitive', () => {
    const { container } = render(<LiveModeToggle active={true} onChange={() => {}} />);
    expect(container.querySelector('[data-slot="switch"]')).not.toBeNull();
  });
});
