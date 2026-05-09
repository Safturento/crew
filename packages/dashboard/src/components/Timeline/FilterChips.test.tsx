import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FilterChips } from './FilterChips.js';
import { defaultVisibleSet, type ChipGroup } from './eventClassification.js';

describe('FilterChips', () => {
  it('renders six chips with the curated default labels', () => {
    render(<FilterChips visible={defaultVisibleSet} onChange={() => {}} />);
    for (const label of [
      'Tool calls',
      'Assistant prose',
      'Thinking',
      'System',
      'Hooks & skills',
      'Other',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('reflects the visible set with aria-pressed', () => {
    render(<FilterChips visible={defaultVisibleSet} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Tool calls' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Assistant prose' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Thinking' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Hooks & skills' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Other' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a default-on chip toggles it off via onChange', async () => {
    const onChange = vi.fn();
    render(<FilterChips visible={defaultVisibleSet} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tool calls' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as Set<ChipGroup>;
    expect(next.has('tool-calls')).toBe(false);
    expect(next.has('assistant-prose')).toBe(true);
  });

  it('clicking a default-off chip toggles it on via onChange', async () => {
    const onChange = vi.fn();
    render(<FilterChips visible={defaultVisibleSet} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Thinking' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as Set<ChipGroup>;
    expect(next.has('thinking')).toBe(true);
    expect(next.has('tool-calls')).toBe(true);
  });
});
