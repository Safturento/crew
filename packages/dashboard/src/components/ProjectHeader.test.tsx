import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectHeader } from './ProjectHeader.js';

describe('ProjectHeader', () => {
  it('renders the back link, name heading, config path, and action buttons', () => {
    render(
      <ProjectHeader name="kanban-api" configPath="~/.config/crew/projects/kanban-api.toml" />,
    );
    expect(screen.getByRole('link', { name: /Projects/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'kanban-api' })).toBeInTheDocument();
    expect(screen.getByText(/kanban-api\.toml/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('the back link points at #/projects', () => {
    render(<ProjectHeader name="x" configPath="" />);
    expect(screen.getByRole('link', { name: /Projects/ }).getAttribute('href')).toBe('#/projects');
  });

  it('Edit and Remove are stubs that do not throw when clicked', () => {
    render(<ProjectHeader name="x" configPath="" />);
    screen.getByRole('button', { name: 'Edit' }).click();
    screen.getByRole('button', { name: 'Remove' }).click();
  });
});
