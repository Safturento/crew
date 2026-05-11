import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectsListPage } from './ProjectsListPage.js';
import type { Project } from '../data/types.js';

const projects: Project[] = [
  { name: 'kanban-api', repoPath: '~/code/kanban-api', branch: 'main', jiraKey: 'KAN', activeCount: 3 },
  { name: 'recipes-app', repoPath: '~/code/recipes-app', branch: 'main', jiraKey: 'REC', activeCount: 1 },
];

describe('ProjectsListPage', () => {
  it('renders the heading + Register button + a row per project', () => {
    render(<ProjectsListPage projects={projects} />);
    expect(screen.getByRole('heading', { name: /projects/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register project/i })).toBeInTheDocument();
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('recipes-app')).toBeInTheDocument();
  });

  it('renders the empty state when no projects are registered', () => {
    render(<ProjectsListPage projects={[]} />);
    expect(screen.getByText(/no projects registered yet/i)).toBeInTheDocument();
  });
});
