import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Tag } from './tag.js';

describe('Tag', () => {
  it('renders children with mono font + small height', () => {
    render(
      <Tag color="finished" intensity="mid">
        Edit
      </Tag>,
    );
    const t = screen.getByText('Edit');
    expect(t.className).toContain('font-mono');
    expect(t.className).toContain('h-[17px]');
  });

  it('exposes color/intensity as data attributes', () => {
    render(
      <Tag color="waiting" intensity="muted">
        Bash
      </Tag>,
    );
    const t = screen.getByText('Bash');
    expect(t).toHaveAttribute('data-color', 'waiting');
    expect(t).toHaveAttribute('data-intensity', 'muted');
  });
});
