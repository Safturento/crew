import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from './switch.js';

describe('Switch', () => {
  it('renders an unchecked switch by default', () => {
    render(<Switch aria-label="Live" />);
    const s = screen.getByRole('switch', { name: 'Live' });
    expect(s).toBeInTheDocument();
    expect(s).toHaveAttribute('data-state', 'unchecked');
  });

  it('renders checked when the prop is set', () => {
    render(<Switch aria-label="Live" checked onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Live' })).toHaveAttribute('data-state', 'checked');
  });

  it('fires onCheckedChange on click', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch onCheckedChange={onCheckedChange} aria-label="Live" />);
    await userEvent.click(screen.getByRole('switch', { name: 'Live' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('disabled prop blocks interaction and renders disabled', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch disabled onCheckedChange={onCheckedChange} aria-label="Live" />);
    const s = screen.getByRole('switch', { name: 'Live' });
    expect(s).toBeDisabled();
    await userEvent.click(s);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
