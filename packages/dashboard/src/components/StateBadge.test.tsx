import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StateBadge } from './StateBadge.js';
import type { AgentState } from '../data/types.js';

describe('StateBadge', () => {
  it('renders the human label for each state', () => {
    render(<StateBadge state="waiting" />);
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('exposes the state via aria-label so it is queryable accessibly', () => {
    render(<StateBadge state="pr_open" />);
    expect(screen.getByRole('status')).toHaveAccessibleName('PR open');
  });

  it('applies the mid intensity by default', () => {
    render(<StateBadge state="running" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-intensity', 'mid');
  });

  it('applies the requested intensity', () => {
    render(<StateBadge state="error" intensity="loud" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-intensity', 'loud');
  });

  it('renders an animated dot for running and initializing', () => {
    render(<StateBadge state="running" />);
    expect(screen.getByTestId('state-badge-pulse')).toBeInTheDocument();
  });

  it('renders a static dot for non-active states', () => {
    render(<StateBadge state="finished" />);
    expect(screen.queryByTestId('state-badge-pulse')).not.toBeInTheDocument();
    expect(screen.getByTestId('state-badge-dot')).toBeInTheDocument();
  });

  const STATES_AND_TOKENS: Array<[AgentState, string]> = [
    ['waiting', 'state-waiting'],
    ['running', 'state-running'],
    ['error', 'state-error'],
    ['pr_open', 'state-pr-open'],
    ['finished', 'state-finished'],
    ['initializing', 'state-initializing'],
    ['idle', 'state-idle'],
  ];

  it.each(STATES_AND_TOKENS)('emits literal Tailwind tokens for %s', (state, token) => {
    render(<StateBadge state={state} />);
    const badge = screen.getByRole('status');
    expect(badge.className).toContain(token);
  });
});
