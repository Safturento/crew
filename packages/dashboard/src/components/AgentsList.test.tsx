import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AgentsList } from './AgentsList.js';
import type { Agent, Project } from '../data/types.js';

const projects: Project[] = [
  { name: 'kanban-api', repoPath: '~/code/kanban-api' },
  { name: 'recipes-app', repoPath: '~/code/recipes-app' },
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
];

describe('AgentsList', () => {
  it('renders one section per project that has agents', () => {
    render(<AgentsList projects={projects} agents={agents} onSelectAgent={() => {}} />);
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('recipes-app')).toBeInTheDocument();
  });

  it('orders agents within a project: attention-states first, then started DESC', () => {
    render(<AgentsList projects={projects} agents={agents} onSelectAgent={() => {}} />);
    const rows = screen.getAllByRole('button', { name: /KAN-/ });
    expect(rows[0]).toHaveAccessibleName(/KAN-2/);
    expect(rows[1]).toHaveAccessibleName(/KAN-1/);
  });

  it('omits projects with no agents', () => {
    const projectsWithExtra: Project[] = [...projects, { name: 'crew', repoPath: '~/code/crew' }];
    render(<AgentsList projects={projectsWithExtra} agents={agents} onSelectAgent={() => {}} />);
    expect(screen.queryByText('crew')).not.toBeInTheDocument();
  });
});
