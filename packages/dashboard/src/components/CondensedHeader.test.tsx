import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CondensedHeader } from './CondensedHeader.js';
import type { AgentDetail } from '../data/types.js';

const DETAIL: AgentDetail = {
  key: 'kanban-api/KAN-23',
  project: 'kanban-api',
  ticket_key: 'KAN-23',
  ticket_title: 'Drag-and-drop reordering keeps stale board state',
  state: 'waiting',
  worktree_path: '~/code/kanban-api/.worktrees/KAN-23',
  pr_url: null,
  app_url: 'http://localhost:7421',
  jira_url: 'https://safturento.atlassian.net/browse/KAN-23',
  tokens_by_tool: [],
  model: '',
  runs: [],
  tokens: { total: 48_000, input: 0, output: 0, cache_read: 0, cache_creation: 0 },
  tool_call_count: 0,
};

describe('CondensedHeader', () => {
  it('renders ticket key, title, and state badge', () => {
    render(<CondensedHeader detail={DETAIL} showCloseButton={false} />);
    expect(screen.getByText('KAN-23')).toBeInTheDocument();
    expect(
      screen.getByText('Drag-and-drop reordering keeps stale board state'),
    ).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Waiting' })).toBeInTheDocument();
  });

  it('falls back to the ticket key when there is no title', () => {
    render(<CondensedHeader detail={{ ...DETAIL, ticket_title: null }} showCloseButton={false} />);
    expect(screen.getAllByText('KAN-23')).toHaveLength(2);
  });

  it('shows the close button only when showCloseButton is set, and wires onClose', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <CondensedHeader detail={DETAIL} showCloseButton={false} onClose={onClose} />,
    );
    expect(screen.queryByRole('button', { name: 'Close drawer' })).not.toBeInTheDocument();

    rerender(<CondensedHeader detail={DETAIL} showCloseButton onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
