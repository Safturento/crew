import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultClient } from '../data/queries.js';
import { FIXTURE_AGENTS, FIXTURE_PROJECT_DETAILS } from '../data/fixtures.js';
import { ProjectDetailPage } from './ProjectDetailPage.js';

function renderWithQuery(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProjectDetailPage', () => {
  it('renders the project name, config path, TOML, and AGENTS heading', async () => {
    vi.spyOn(defaultClient, 'getProject').mockResolvedValue(FIXTURE_PROJECT_DETAILS['kanban-api']!);
    vi.spyOn(defaultClient, 'listAgents').mockResolvedValue(FIXTURE_AGENTS);

    renderWithQuery(<ProjectDetailPage slug="kanban-api" />);

    expect(await screen.findByRole('heading', { name: 'kanban-api' })).toBeInTheDocument();
    expect(screen.getByText(/kanban-api\.toml/)).toBeInTheDocument();
    expect(screen.getByTestId('project-config-toml').textContent).toMatch(/name = "kanban-api"/);
    expect(screen.getByText('AGENTS')).toBeInTheDocument();
  });

  it('renders only agents matching the project name', async () => {
    vi.spyOn(defaultClient, 'getProject').mockResolvedValue(FIXTURE_PROJECT_DETAILS['kanban-api']!);
    vi.spyOn(defaultClient, 'listAgents').mockResolvedValue(FIXTURE_AGENTS);

    renderWithQuery(<ProjectDetailPage slug="kanban-api" />);

    await screen.findByRole('heading', { name: 'kanban-api' });
    await waitFor(() => {
      // KAN-31 belongs to kanban-api
      expect(screen.queryByText('KAN-31')).toBeInTheDocument();
    });
    // REC-7 belongs to recipes-app — must not appear
    expect(screen.queryByText('REC-7')).not.toBeInTheDocument();
  });

  it('renders a friendly fallback when the project is not found', async () => {
    vi.spyOn(defaultClient, 'getProject').mockRejectedValue(new Error('boom'));

    renderWithQuery(<ProjectDetailPage slug="missing" />);

    await waitFor(() => expect(screen.getByText(/Project not found/i)).toBeInTheDocument());
  });

  it('renders the active/total count next to the AGENTS heading', async () => {
    vi.spyOn(defaultClient, 'getProject').mockResolvedValue(FIXTURE_PROJECT_DETAILS['kanban-api']!);
    vi.spyOn(defaultClient, 'listAgents').mockResolvedValue(FIXTURE_AGENTS);

    renderWithQuery(<ProjectDetailPage slug="kanban-api" />);

    await screen.findByRole('heading', { name: 'kanban-api' });
    const countText = await screen.findByText(/\d+ active · \d+ total/);
    expect(countText).toBeInTheDocument();
  });

  it('hides the inner ProjectSection header (no per-section toggle on the project page)', async () => {
    vi.spyOn(defaultClient, 'getProject').mockResolvedValue(FIXTURE_PROJECT_DETAILS['kanban-api']!);
    vi.spyOn(defaultClient, 'listAgents').mockResolvedValue(FIXTURE_AGENTS);

    renderWithQuery(<ProjectDetailPage slug="kanban-api" />);

    await screen.findByRole('heading', { name: 'kanban-api' });
    expect(
      screen.queryByRole('button', { name: /toggle kanban-api/i }),
    ).not.toBeInTheDocument();
  });
});
