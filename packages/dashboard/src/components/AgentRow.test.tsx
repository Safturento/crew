import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentRow } from './AgentRow.js';
import type { Agent } from '../data/types.js';

const baseAgent: Agent = {
  key: 'KAN-31',
  projectName: 'kanban-api',
  ticketTitle: 'Add board archival endpoint',
  state: 'waiting',
  startedAt: new Date(Date.now() - 33 * 60_000 - 4_000).toISOString(),
  tokens: 48_240,
};

describe('AgentRow', () => {
  it('renders the ticket key, title, runtime, and tokens', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByText('KAN-31')).toBeInTheDocument();
    expect(screen.getByText(/Add board archival endpoint/)).toBeInTheDocument();
    expect(screen.getByText(/^33m 0[34]s$/)).toBeInTheDocument();
    expect(screen.getByText('48.2k')).toBeInTheDocument();
  });

  it('renders the state badge', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Waiting');
  });

  it('renders an "Answer" quick action for waiting state', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Answer' })).toBeInTheDocument();
  });

  it('renders a "View PR" quick action for pr_open state', () => {
    render(
      <AgentRow
        agent={{ ...baseAgent, state: 'pr_open', prUrl: 'https://example.com/pr/1' }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('link', { name: /View PR/ })).toHaveAttribute(
      'href',
      'https://example.com/pr/1',
    );
  });

  it('renders no quick action for running/initializing/idle', () => {
    render(<AgentRow agent={{ ...baseAgent, state: 'running' }} onSelect={() => {}} />);
    expect(screen.queryByRole('button', { name: /Answer|Retry|Archive/ })).not.toBeInTheDocument();
  });

  it('fires onSelect when the row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AgentRow agent={baseAgent} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /KAN-31/ }));
    expect(onSelect).toHaveBeenCalledWith('KAN-31');
  });

  it('does not fire onSelect when the quick action is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AgentRow agent={baseAgent} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'Answer' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks the row with attention data attribute for tinting', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /KAN-31/ })).toHaveAttribute(
      'data-attention',
      'waiting',
    );
  });
});
