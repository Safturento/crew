import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';

describe('Badge', () => {
  it('renders a native <span>', () => {
    render(<Badge>label</Badge>);
    expect(screen.getByText('label').tagName).toBe('SPAN');
  });

  it('has the static shape (rounded-full, h-5, font-mono, text-xs)', () => {
    render(<Badge>label</Badge>);
    const el = screen.getByText('label');
    expect(el.className).toContain('rounded-full');
    expect(el.className).toContain('h-5');
    expect(el.className).toContain('font-mono');
    expect(el.className).toContain('text-xs');
  });

  it('renders the icon slot when provided', () => {
    render(<Badge icon={<svg data-testid="icon" />}>Waiting</Badge>);
    expect(screen.getByText('Waiting').querySelector('[data-testid="icon"]')).not.toBeNull();
  });

  it('does NOT accept hasIcon prop (removed from the type)', () => {
    // @ts-expect-error — hasIcon was replaced by `icon`.
    render(<Badge hasIcon>label</Badge>);
  });

  it('defaults to color="running" intensity="mid"', () => {
    render(<Badge>x</Badge>);
    const el = screen.getByText('x');
    expect(el.dataset.color).toBe('running');
    expect(el.dataset.intensity).toBe('mid');
  });
});
