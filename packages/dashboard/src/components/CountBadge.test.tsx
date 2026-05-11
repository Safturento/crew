import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CountBadge } from './CountBadge.js';

describe('CountBadge', () => {
  it('renders the count', () => {
    render(<CountBadge count={6} />);
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('renders a muted "0" when count is zero', () => {
    render(<CountBadge count={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('exposes the state as a data attribute when count > 0', () => {
    const { container } = render(<CountBadge count={1} state="error" />);
    const badge = container.querySelector('[data-state="error"]');
    expect(badge).not.toBeNull();
  });

  it('defaults to the initializing state when none is given', () => {
    const { container } = render(<CountBadge count={3} />);
    const badge = container.querySelector('[data-state="initializing"]');
    expect(badge).not.toBeNull();
  });
});
