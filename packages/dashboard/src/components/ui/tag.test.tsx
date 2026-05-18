import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Tag } from './tag';

describe('Tag', () => {
  it('renders a span with 17px height + 4px radius + Fira Code 11', () => {
    render(<Tag>label</Tag>);
    const el = screen.getByText('label');
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('h-[17px]');
    expect(el.className).toContain('rounded-[4px]');
    expect(el.className).toContain('text-[11px]');
    expect(el.className).toContain('font-mono');
  });

  it('renders the icon slot when provided', () => {
    render(<Tag icon={<svg data-testid="icon" />}>tool_call</Tag>);
    expect(screen.getByText('tool_call').querySelector('[data-testid="icon"]')).not.toBeNull();
  });

  it('defaults to color="running" intensity="mid"', () => {
    render(<Tag>x</Tag>);
    const el = screen.getByText('x');
    expect(el.dataset.color).toBe('running');
    expect(el.dataset.intensity).toBe('mid');
  });
});
