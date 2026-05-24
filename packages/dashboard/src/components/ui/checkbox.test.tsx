import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from './checkbox.js';

describe('Checkbox', () => {
  it('renders an unchecked checkbox by default', () => {
    render(<Checkbox aria-label="Toggle thing" />);
    const cb = screen.getByRole('checkbox', { name: 'Toggle thing' });
    expect(cb).toBeInTheDocument();
    expect(cb).not.toBeChecked();
  });

  it('reflects checked=true via aria-checked', () => {
    render(<Checkbox checked aria-label="Toggle" />);
    expect(screen.getByRole('checkbox', { name: 'Toggle' })).toBeChecked();
  });

  it('fires onCheckedChange on click', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox onCheckedChange={onCheckedChange} aria-label="Toggle" />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Toggle' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('disabled prop blocks interaction and renders disabled', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox disabled onCheckedChange={onCheckedChange} aria-label="Toggle" />);
    const cb = screen.getByRole('checkbox', { name: 'Toggle' });
    expect(cb).toBeDisabled();
    await userEvent.click(cb);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
