import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge.js';

describe('Badge', () => {
  it('renders children + applies color/intensity classes', () => {
    render(
      <Badge color="running" intensity="mid">
        Running
      </Badge>,
    );
    const b = screen.getByText('Running');
    expect(b.className).toContain('bg-slate-1050');
    expect(b.className).toContain('text-slate-400');
  });

  it('renders a dot when hasIcon is true', () => {
    render(
      <Badge color="waiting" intensity="muted" hasIcon>
        Waiting
      </Badge>,
    );
    expect(screen.getByTestId('badge-dot')).toBeInTheDocument();
  });

  it('exposes color/intensity as data attributes', () => {
    render(
      <Badge color="error" intensity="loud">
        Err
      </Badge>,
    );
    const b = screen.getByText('Err');
    expect(b).toHaveAttribute('data-color', 'error');
    expect(b).toHaveAttribute('data-intensity', 'loud');
  });

  it('defaults to color=running, intensity=mid', () => {
    render(<Badge>Default</Badge>);
    const b = screen.getByText('Default');
    expect(b).toHaveAttribute('data-color', 'running');
    expect(b).toHaveAttribute('data-intensity', 'mid');
  });
});
