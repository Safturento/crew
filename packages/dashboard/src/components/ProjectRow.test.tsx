import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectRow } from './ProjectRow.js';
import type { Project } from '../data/types.js';

const sampleProject: Project = {
  name: 'kanban-api',
  repoPath: '~/code/kanban-api',
  branch: 'main',
  jiraKey: 'KAN',
  activeCount: 6,
};

describe('ProjectRow', () => {
  it('renders the five project fields', () => {
    render(<ProjectRow project={sampleProject} />);
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('~/code/kanban-api')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('KAN')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('links to the project detail hash route', () => {
    render(<ProjectRow project={sampleProject} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('#/projects/kanban-api');
  });

  it('renders a muted "0" when activeCount is zero', () => {
    render(<ProjectRow project={{ ...sampleProject, activeCount: 0 }} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
