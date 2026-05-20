import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectSection } from './ProjectSection.js';
import type { Agent, Project } from '../data/types.js';

const project: Project = {
  name: 'kanban-api',
  repoPath: '~/code/kanban-api',
  branch: 'main',
  jiraKey: 'KAN',
  activeCount: 2,
};

const agents: Agent[] = [
  {
    key: 'KAN-1',
    projectName: 'kanban-api',
    ticketTitle: 't',
    state: 'running',
    startedAt: '2026-04-26T13:00:00Z',
    tokens: 100,
  },
  {
    key: 'KAN-2',
    projectName: 'kanban-api',
    ticketTitle: 't',
    state: 'finished',
    startedAt: '2026-04-26T08:00:00Z',
    tokens: 200,
  },
];

describe('ProjectSection', () => {
  it('renders the project name, repo path, and counts', () => {
    render(<ProjectSection project={project} agents={agents} onSelectAgent={() => {}} />);
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('~/code/kanban-api')).toBeInTheDocument();
    expect(screen.getByText(/1 active · 2 total/)).toBeInTheDocument();
  });

  it('renders one row per agent', () => {
    render(<ProjectSection project={project} agents={agents} onSelectAgent={() => {}} />);
    expect(screen.getByText('KAN-1')).toBeInTheDocument();
    expect(screen.getByText('KAN-2')).toBeInTheDocument();
  });

  it('collapses when the header is clicked', async () => {
    const user = userEvent.setup();
    render(<ProjectSection project={project} agents={agents} onSelectAgent={() => {}} />);
    await user.click(screen.getByRole('button', { name: /toggle kanban-api/i }));
    expect(screen.queryByText('KAN-1')).not.toBeInTheDocument();
  });

  it('shows a dashed-border empty state when there are no agents', () => {
    render(<ProjectSection project={project} agents={[]} onSelectAgent={() => {}} />);
    expect(screen.getByText(/No agents yet/)).toBeInTheDocument();
  });

  it('renders the project header by default', () => {
    render(<ProjectSection project={project} agents={agents} onSelectAgent={() => {}} />);
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText(/1 active · 2 total/)).toBeInTheDocument();
  });

  it('omits the project header when showHeader is false but still renders agents', () => {
    render(
      <ProjectSection
        project={project}
        agents={agents}
        onSelectAgent={() => {}}
        showHeader={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /toggle kanban-api/i })).not.toBeInTheDocument();
    expect(screen.queryByText('~/code/kanban-api')).not.toBeInTheDocument();
    expect(screen.getByText('KAN-1')).toBeInTheDocument();
    expect(screen.getByText('KAN-2')).toBeInTheDocument();
  });

  it('omits the header and still renders the empty state when showHeader is false', () => {
    render(
      <ProjectSection project={project} agents={[]} onSelectAgent={() => {}} showHeader={false} />,
    );
    expect(screen.queryByRole('button', { name: /toggle kanban-api/i })).not.toBeInTheDocument();
    expect(screen.getByText(/No agents yet/)).toBeInTheDocument();
  });

  it('renders an "Open project page" icon-button when onOpenProject is provided', () => {
    render(
      <ProjectSection
        project={project}
        agents={agents}
        onSelectAgent={() => {}}
        onOpenProject={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /open project page/i })).toBeInTheDocument();
  });

  it('does not render the icon-button when onOpenProject is omitted', () => {
    render(<ProjectSection project={project} agents={agents} onSelectAgent={() => {}} />);
    expect(screen.queryByRole('button', { name: /open project page/i })).not.toBeInTheDocument();
  });

  it('fires onOpenProject without toggling collapse', async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();
    render(
      <ProjectSection
        project={project}
        agents={agents}
        onSelectAgent={() => {}}
        onOpenProject={onOpenProject}
      />,
    );
    await user.click(screen.getByRole('button', { name: /open project page/i }));
    expect(onOpenProject).toHaveBeenCalledWith('kanban-api');
    // Section should still be expanded — KAN-1 row visible.
    expect(screen.getByText('KAN-1')).toBeInTheDocument();
  });
});
