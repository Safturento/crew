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

const projects: Project[] = [
  {
    name: 'kanban-api',
    repoPath: '~/code/kanban-api',
    branch: 'main',
    jiraKey: 'KAN',
    activeCount: 1,
  },
];

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
  // useRunnerStatus polls defaultClient on mount; default it to offline so
  // tests that don't care about the runner stay deterministic and quiet.
  vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({ online: false, lastSeen: null });
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
      app_url: null,
      jira_url: null,
      tokens_by_tool: [],
      model: '',
      runs: [
        {
          id: '1',
          command: 'run',
          started_at: '2026-04-26T13:00:00Z',
          completed_at: null,
          doc_load_coverage_pct: null,
          cleanliness_pass: null,
          pr_claim_input_tokens: null,
          parity_violations: null,
        },
      ],
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
      app_url: null,
      jira_url: null,
      tokens_by_tool: [],
      model: '',
      runs: [
        {
          id: '1',
          command: 'run',
          started_at: '2026-04-26T13:00:00Z',
          completed_at: null,
          doc_load_coverage_pct: null,
          cleanliness_pass: null,
          pr_claim_input_tokens: null,
          parity_violations: null,
        },
      ],
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
    // useRunnerStatus polls defaultClient (not the injected client); resolve
    // it so only the failing list queries throw to the boundary.
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({ online: false, lastSeen: null });
    const failingClient: DaemonClient = {
      listProjects: () => Promise.reject(new Error('daemon unreachable')),
      listAgents: () => Promise.reject(new Error('daemon unreachable')),
      enqueueAction: () => Promise.reject(new Error('daemon unreachable')),
      getRunnerStatus: () => Promise.reject(new Error('daemon unreachable')),
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

describe('App — agent actions (CREW-217)', () => {
  const idleAgents: Agent[] = [
    {
      key: 'KAN-50',
      projectName: 'kanban-api',
      ticketTitle: 'Idle work',
      state: 'idle',
      startedAt: '2026-04-26T13:00:00Z',
      tokens: 10,
    },
  ];

  const SAMPLE_ACTION = {
    id: 1,
    kind: 'run' as const,
    ticketKey: 'KAN-50',
    project: 'kanban-api',
    payload: { kind: 'run' as const },
    status: 'pending' as const,
    error: null,
    createdAt: '2026-06-04T00:00:00Z',
    updatedAt: '2026-06-04T00:00:00Z',
  };

  beforeEach(() => {
    window.location.hash = '';
  });

  it('enqueues a run action when Resume is clicked (runner online)', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({ online: true, lastSeen: 1 });
    const enqueue = vi.spyOn(defaultClient, 'enqueueAction').mockResolvedValue(SAMPLE_ACTION);
    const user = userEvent.setup();

    renderWithProviders(<App client={new MockDaemonClient({ projects, agents: idleAgents })} />);

    const resume = await screen.findByRole('button', { name: 'Resume' });
    await waitFor(() => expect(resume).toBeEnabled());
    await user.click(resume);

    expect(enqueue).toHaveBeenCalledWith({
      kind: 'run',
      project: 'kanban-api',
      ticketKey: 'KAN-50',
    });
  });

  it('enqueues a finish action when Finish is clicked (runner online)', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({ online: true, lastSeen: 1 });
    const enqueue = vi
      .spyOn(defaultClient, 'enqueueAction')
      .mockResolvedValue({ ...SAMPLE_ACTION, kind: 'finish', payload: { kind: 'finish' } });
    const user = userEvent.setup();

    // CREW-220: Finish is only actionable once the PR is merged.
    const mergedAgents: Agent[] = [{ ...idleAgents[0]!, state: 'pr_merged' }];
    renderWithProviders(<App client={new MockDaemonClient({ projects, agents: mergedAgents })} />);

    const finish = await screen.findByRole('button', { name: 'Finish' });
    await waitFor(() => expect(finish).toBeEnabled());
    await user.click(finish);

    expect(enqueue).toHaveBeenCalledWith({
      kind: 'finish',
      project: 'kanban-api',
      ticketKey: 'KAN-50',
    });
  });

  it('disables the enqueue-able QuickActions when no runner is online', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({ online: false, lastSeen: null });

    renderWithProviders(<App client={new MockDaemonClient({ projects, agents: idleAgents })} />);

    const resume = await screen.findByRole('button', { name: 'Resume' });
    expect(resume).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeDisabled();
  });
});
