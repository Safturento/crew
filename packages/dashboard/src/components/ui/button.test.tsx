import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button.js';

describe('Button', () => {
  it('renders with color + intensity classes from pill-variants', () => {
    render(
      <Button color="running" intensity="mid">
        Resume
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Resume' });
    expect(btn.className).toContain('bg-slate-1050');
    expect(btn.className).toContain('text-slate-400');
  });

  it('defaults to color=white, intensity=loud, size=default', () => {
    render(<Button>OK</Button>);
    const btn = screen.getByRole('button', { name: 'OK' });
    expect(btn).toHaveAttribute('data-color', 'white');
    expect(btn).toHaveAttribute('data-intensity', 'loud');
    expect(btn).toHaveAttribute('data-size', 'default');
  });

  it('size=icon-sm renders a square 32×32 button', () => {
    render(<Button size="icon-sm" aria-label="Close" />);
    const btn = screen.getByRole('button', { name: 'Close' });
    expect(btn.className).toContain('size-8');
  });

  it('asChild renders the child element', () => {
    render(
      <Button asChild>
        <a href="/foo">Link</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Link' })).toBeInTheDocument();
  });
});
