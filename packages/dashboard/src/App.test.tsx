import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';
import type { DaemonClient } from './data/DaemonClient.js';
import { MockDaemonClient } from './data/MockDaemonClient.js';
import { defaultClient } from './data/queries.js';
import type { Agent, AgentDetail, Project } from './data/types.js';
import { renderWithProviders } from './test/renderWithProviders.js';

const projects: Project[] = [{ name: 'kanban-api', repoPath: '~/code/kanban-api' }];

const agents: Agent[] = [
  {
    key: 'KAN-31',
    projectName: 'kanban-api',
    ticketTitle: 'Add board archival',
    state: 'waiting',
    startedAt: '2026-04-26T13:00:00Z',
    tokens: 1_000,
  },
];

function renderApp() {
  const client = new MockDaemonClient({ projects, agents });
  return renderWithProviders(<App client={client} />);
}

beforeEach(() => {
  window.location.hash = '';
});

describe('App', () => {
  it('renders the agents list with mock data', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('kanban-api')).toBeInTheDocument());
    expect(screen.getByText('KAN-31')).toBeInTheDocument();
  });

  it('shows attention count for waiting/pr_open/error agents', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });

  it('clears the attention count when Clear attention is clicked', async () => {
    const user = userEvent.setup();
    renderApp();
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Clear attention/ }));
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('opens the agent drawer when a row is clicked', async () => {
    const user = userEvent.setup();
    const detail: AgentDetail = {
      key: 'KAN-31',
      project: 'kanban-api',
      ticket_key: 'KAN-31',
      ticket_title: 'Add board archival',
      state: 'waiting',
      worktree_path: '/repos/kanban-api-KAN-31',
      pr_url: null,
      runs: [{ id: '1', command: 'run', started_at: '2026-04-26T13:00:00Z', completed_at: null }],
      tokens: { total: 1_000, input: 0, output: 0, cache_read: 0, cache_creation: 0 },
      tool_call_count: 0,
    };
    vi.spyOn(defaultClient, 'getAgent').mockResolvedValue(detail);

    renderApp();
    await waitFor(() => screen.getByText('KAN-31'));
    await user.click(screen.getByRole('button', { name: /KAN-31/ }));
    expect(window.location.hash).toBe('#/agent/KAN-31');
    expect(await screen.findByTestId('drawer-header')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('renders the full-page route at /agent/:key/full', async () => {
    const detail: AgentDetail = {
      key: 'KAN-31',
      project: 'kanban-api',
      ticket_key: 'KAN-31',
      ticket_title: 'Add board archival',
      state: 'running',
      worktree_path: '/repos/kanban-api-KAN-31',
      pr_url: null,
      runs: [{ id: '1', command: 'run', started_at: '2026-04-26T13:00:00Z', completed_at: null }],
      tokens: { total: 1_000, input: 0, output: 0, cache_read: 0, cache_creation: 0 },
      tool_call_count: 0,
    };
    vi.spyOn(defaultClient, 'getAgent').mockResolvedValue(detail);
    window.location.hash = '#/agent/KAN-31/full';

    renderApp();

    expect(await screen.findByTestId('drawer-header')).toBeInTheDocument();
    expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('renders the error fallback when a query rejects', async () => {
    const failingClient: DaemonClient = {
      listProjects: () => Promise.reject(new Error('daemon unreachable')),
      listAgents: () => Promise.reject(new Error('daemon unreachable')),
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, throwOnError: true } },
    });

    renderWithProviders(<App client={failingClient} />, { queryClient });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/daemon unreachable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
