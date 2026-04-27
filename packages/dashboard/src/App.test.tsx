import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from './App.js';
import { MockDaemonClient } from './data/MockDaemonClient.js';
import type { Agent, Project } from './data/types.js';

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
  return render(<App client={client} />);
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

  it('navigates to the agent detail placeholder when a row is clicked', async () => {
    const user = userEvent.setup();
    renderApp();
    await waitFor(() => screen.getByText('KAN-31'));
    await user.click(screen.getByRole('button', { name: /KAN-31/ }));
    expect(window.location.hash).toBe('#/agents/KAN-31');
    expect(
      await screen.findByText(/agent detail drawer ships in a follow-up plan/i),
    ).toBeInTheDocument();
  });
});
