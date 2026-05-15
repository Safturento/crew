import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentsList } from './AgentsList.js';
import { renderWithProviders } from '../test/renderWithProviders.js';
import { defaultClient } from '../data/queries.js';
import type { Agent, AggregateMetrics, Project } from '../data/types.js';

const ZERO_METRICS: AggregateMetrics = {
  runCount: 0,
  avgDocLoadCoverage: null,
  cleanlinessPassRate: 0,
  avgPrClaimInputTokens: 0,
  parityViolationRate: 0,
};

const projects: Project[] = [
  {
    name: 'kanban-api',
    repoPath: '~/code/kanban-api',
    branch: 'main',
    jiraKey: 'KAN',
    activeCount: 2,
  },
  {
    name: 'recipes-app',
    repoPath: '~/code/recipes-app',
    branch: 'main',
    jiraKey: 'REC',
    activeCount: 2,
  },
];

const agents: Agent[] = [
  {
    key: 'KAN-1',
    projectName: 'kanban-api',
    ticketTitle: 'older running',
    state: 'running',
    startedAt: '2026-04-26T10:00:00Z',
    tokens: 100,
  },
  {
    key: 'KAN-2',
    projectName: 'kanban-api',
    ticketTitle: 'newer waiting',
    state: 'waiting',
    startedAt: '2026-04-26T11:00:00Z',
    tokens: 200,
  },
  {
    key: 'REC-1',
    projectName: 'recipes-app',
    ticketTitle: 'finished',
    state: 'finished',
    startedAt: '2026-04-26T08:00:00Z',
    tokens: 300,
  },
  {
    key: 'REC-2',
    projectName: 'recipes-app',
    ticketTitle: 'idle',
    state: 'idle',
    startedAt: '2026-04-26T09:00:00Z',
    tokens: 250,
  },
];

describe('AgentsList', () => {
  beforeEach(() => {
    localStorage.clear();
    // The embedded MetricsTrendWidget fetches on mount — stub it so these
    // section-rendering tests don't make real requests.
    vi.spyOn(defaultClient, 'getMetrics').mockResolvedValue(ZERO_METRICS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders one section per project that has agents', () => {
    renderWithProviders(
      <AgentsList projects={projects} agents={agents} onSelectAgent={() => {}} />,
    );
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('recipes-app')).toBeInTheDocument();
  });

  it('orders agents within a project: attention-states first, then started DESC', () => {
    renderWithProviders(
      <AgentsList projects={projects} agents={agents} onSelectAgent={() => {}} />,
    );
    const rows = screen.getAllByRole('button', { name: /KAN-/ });
    expect(rows[0]).toHaveAccessibleName(/KAN-2/);
    expect(rows[1]).toHaveAccessibleName(/KAN-1/);
  });

  it('omits projects with no agents', () => {
    const projectsWithExtra: Project[] = [
      ...projects,
      { name: 'crew', repoPath: '~/code/crew', branch: 'main', jiraKey: 'CREW', activeCount: 0 },
    ];
    renderWithProviders(
      <AgentsList projects={projectsWithExtra} agents={agents} onSelectAgent={() => {}} />,
    );
    expect(screen.queryByText('crew')).not.toBeInTheDocument();
  });

  describe('Hide finished toggle', () => {
    it('hides finished agents by default', () => {
      renderWithProviders(
        <AgentsList projects={projects} agents={agents} onSelectAgent={() => {}} />,
      );
      expect(screen.queryByRole('button', { name: /REC-1/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /KAN-1/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /REC-2/ })).toBeInTheDocument();
    });

    it('renders a switch labelled "Hide finished" that defaults to checked', () => {
      renderWithProviders(
        <AgentsList projects={projects} agents={agents} onSelectAgent={() => {}} />,
      );
      const toggle = screen.getByRole('switch', { name: /hide finished/i });
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    it('reveals finished agents when toggled off', async () => {
      renderWithProviders(
        <AgentsList projects={projects} agents={agents} onSelectAgent={() => {}} />,
      );
      await userEvent.click(screen.getByRole('switch', { name: /hide finished/i }));
      expect(screen.getByRole('button', { name: /REC-1/ })).toBeInTheDocument();
    });

    it('persists the off state to localStorage', async () => {
      renderWithProviders(
        <AgentsList projects={projects} agents={agents} onSelectAgent={() => {}} />,
      );
      await userEvent.click(screen.getByRole('switch', { name: /hide finished/i }));
      expect(localStorage.getItem('crew.dashboard.hideFinished')).toBe('false');
    });

    it('rehydrates the off state from localStorage on mount', () => {
      localStorage.setItem('crew.dashboard.hideFinished', 'false');
      renderWithProviders(
        <AgentsList projects={projects} agents={agents} onSelectAgent={() => {}} />,
      );
      expect(screen.getByRole('switch', { name: /hide finished/i })).toHaveAttribute(
        'aria-checked',
        'false',
      );
      expect(screen.getByRole('button', { name: /REC-1/ })).toBeInTheDocument();
    });

    it('hides finished agents again after toggling back on, persisting the change', async () => {
      renderWithProviders(
        <AgentsList projects={projects} agents={agents} onSelectAgent={() => {}} />,
      );
      const toggle = screen.getByRole('switch', { name: /hide finished/i });
      await userEvent.click(toggle);
      expect(screen.getByRole('button', { name: /REC-1/ })).toBeInTheDocument();
      await userEvent.click(toggle);
      expect(screen.queryByRole('button', { name: /REC-1/ })).not.toBeInTheDocument();
      expect(localStorage.getItem('crew.dashboard.hideFinished')).toBe('true');
    });
  });
});
