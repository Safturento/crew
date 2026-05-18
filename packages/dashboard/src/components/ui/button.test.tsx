import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders a native <button> by default', () => {
    render(<Button>hi</Button>);
    expect(screen.getByRole('button').tagName).toBe('BUTTON');
  });

  it.each(['xs', 'sm', 'md', 'lg'] as const)(
    'renders size=%s with the expected height class',
    (size) => {
      const expectedHeight = { xs: 'h-6', sm: 'h-8', md: 'h-9', lg: 'h-10' }[size];
      render(<Button size={size}>x</Button>);
      expect(screen.getByRole('button').className).toContain(expectedHeight);
    },
  );

  it('renders the icon slot before children', () => {
    render(<Button icon={<svg data-testid="icon" />}>Resume</Button>);
    const btn = screen.getByRole('button', { name: 'Resume' });
    expect(btn.querySelector('[data-testid="icon"]')).not.toBeNull();
    expect(btn.firstElementChild?.getAttribute('data-testid')).toBe('icon');
  });

  it('renders icon-only when no children are passed', () => {
    render(<Button icon={<svg data-testid="icon" />} aria-label="Close" />);
    const btn = screen.getByRole('button', { name: 'Close' });
    expect(btn.querySelector('[data-testid="icon"]')).not.toBeNull();
    expect(btn.textContent).toBe('');
  });

  it('does not accept "default" as a size value (removed from the type)', () => {
    // @ts-expect-error — `default` is no longer a valid size.
    render(<Button size="default">x</Button>);
  });

  it('exposes data-color and data-intensity for downstream introspection', () => {
    render(
      <Button color="error" intensity="loud">
        Inspect
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Inspect' });
    expect(btn.dataset.color).toBe('error');
    expect(btn.dataset.intensity).toBe('loud');
  });
});
