import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AgentDrawer } from './AgentDrawer.js';
import { defaultClient } from '../data/queries.js';
import type { AgentDetail, TranscriptEvent } from '../data/types.js';
import { renderWithProviders } from '../test/renderWithProviders.js';

const SAMPLE_DETAIL: AgentDetail = {
  key: 'KAN-1',
  project: 'kanban-api',
  ticket_key: 'KAN-1',
  ticket_title: 'Add board archival',
  state: 'pr_open',
  worktree_path: '/repos/kanban-api-KAN-1',
  pr_url: 'https://github.com/example/repo/pull/12',
  runs: [
    {
      id: '1',
      command: 'run',
      started_at: '2026-04-29T12:00:00Z',
      completed_at: null,
      doc_load_coverage_pct: null,
      cleanliness_pass: null,
      pr_claim_input_tokens: null,
      parity_violations: null,
    },
  ],
  tokens: { total: 12_345, input: 1, output: 1, cache_read: 1, cache_creation: 1 },
  tool_call_count: 0,
};

beforeEach(() => {
  vi.spyOn(defaultClient, 'getAgent').mockResolvedValue(SAMPLE_DETAIL);
  vi.spyOn(defaultClient, 'getTimeline').mockResolvedValue({ events: [] as TranscriptEvent[] });
  window.location.hash = '#/agent/KAN-1';
});

afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('AgentDrawer', () => {
  it('renders the drawer header with project, ticket key, title, and state badge', async () => {
    renderWithProviders(<AgentDrawer agentKey="KAN-1" />);

    expect(await screen.findByTestId('drawer-header')).toBeInTheDocument();
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('KAN-1')).toBeInTheDocument();
    expect(screen.getByText('Add board archival')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName('PR open');
  });

  it('renders total tokens in the header', async () => {
    renderWithProviders(<AgentDrawer agentKey="KAN-1" />);

    await screen.findByTestId('drawer-header');
    expect(screen.getByText('12.3k')).toBeInTheDocument();
  });

  it('renders the worktree path with a copy affordance', async () => {
    renderWithProviders(<AgentDrawer agentKey="KAN-1" />);

    await screen.findByTestId('drawer-header');
    expect(screen.getByText('/repos/kanban-api-KAN-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy worktree path/i })).toBeInTheDocument();
  });

  it('renders the GitHub PR link when pr_url is non-null', async () => {
    renderWithProviders(<AgentDrawer agentKey="KAN-1" />);

    await screen.findByTestId('drawer-header');
    expect(screen.getByRole('link', { name: /view pr/i })).toHaveAttribute(
      'href',
      'https://github.com/example/repo/pull/12',
    );
  });

  it('hides the PR link when pr_url is null', async () => {
    vi.spyOn(defaultClient, 'getAgent').mockResolvedValue({ ...SAMPLE_DETAIL, pr_url: null });

    renderWithProviders(<AgentDrawer agentKey="KAN-1" />);

    await screen.findByTestId('drawer-header');
    expect(screen.queryByRole('link', { name: /view pr/i })).not.toBeInTheDocument();
  });

  it('links to /agent/:key/full via the Open as page action', async () => {
    renderWithProviders(<AgentDrawer agentKey="KAN-1" />);

    const link = await screen.findByRole('link', { name: /open as page/i });
    expect(link).toHaveAttribute('href', '#/agent/KAN-1/full');
  });

  it('closes on Esc and navigates to /', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgentDrawer agentKey="KAN-1" />);
    await screen.findByTestId('drawer-header');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(window.location.hash).toBe('#/'));
  });

  it('closes when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgentDrawer agentKey="KAN-1" />);
    await screen.findByTestId('drawer-header');

    await user.click(screen.getByTestId('drawer-backdrop'));

    await waitFor(() => expect(window.location.hash).toBe('#/'));
  });

  it('closes when the close button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgentDrawer agentKey="KAN-1" />);
    await screen.findByTestId('drawer-header');

    await user.click(screen.getByRole('button', { name: /close drawer/i }));

    await waitFor(() => expect(window.location.hash).toBe('#/'));
  });

  it('renders the Timeline inside the body slot', async () => {
    renderWithProviders(<AgentDrawer agentKey="KAN-1" />);
    // Timeline mounts under the agent body once the agent detail resolves.
    expect(await screen.findByTestId('agent-body')).toBeInTheDocument();
    // With an empty events array the Timeline renders its empty state.
    expect(await screen.findByTestId('timeline-empty')).toBeInTheDocument();
  });
});
