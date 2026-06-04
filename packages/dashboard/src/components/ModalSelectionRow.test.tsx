import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Badge } from '@/components/ui/badge';

import { ModalSelectionRow } from './ModalSelectionRow';

describe('ModalSelectionRow', () => {
  it('renders primary + secondary + meta text', () => {
    render(
      <ModalSelectionRow primary="kanban-api" secondary="~/code/kanban-api" meta="4 active" />,
    );
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('~/code/kanban-api')).toBeInTheDocument();
    expect(screen.getByText('4 active')).toBeInTheDocument();
  });

  it('renders the badge slot when provided', () => {
    render(
      <ModalSelectionRow
        primary="x"
        badge={
          <Badge color="running" intensity="muted">
            KAN
          </Badge>
        }
      />,
    );
    expect(screen.getByText('KAN')).toBeInTheDocument();
  });

  it('is a button and fires onClick when clickable', () => {
    const h = vi.fn();
    render(<ModalSelectionRow primary="x" onClick={h} />);
    const row = screen.getByRole('button', { name: /x/ });
    fireEvent.click(row);
    expect(h).toHaveBeenCalled();
  });

  it('is not a button when no onClick is given', () => {
    render(<ModalSelectionRow primary="static" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
