import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectsTable } from './ProjectsTable.js';
import type { Project } from '../data/types.js';

const projectA: Project = {
  name: 'kanban-api',
  repoPath: '~/code/kanban-api',
  branch: 'main',
  jiraKey: 'KAN',
  activeCount: 3,
};

const projectB: Project = {
  name: 'recipes-app',
  repoPath: '~/code/recipes-app',
  branch: 'main',
  jiraKey: 'REC',
  activeCount: 0,
};

describe('ProjectsTable', () => {
  it('renders the column headers when projects are present', () => {
    render(<ProjectsTable projects={[projectA]} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Repo')).toBeInTheDocument();
    expect(screen.getByText('Branch')).toBeInTheDocument();
    expect(screen.getByText('Jira')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders one row per project', () => {
    render(<ProjectsTable projects={[projectA, projectB]} />);
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('recipes-app')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('shows an empty state when there are no projects', () => {
    render(<ProjectsTable projects={[]} />);
    expect(screen.getByText(/no projects registered yet/i)).toBeInTheDocument();
  });
});
