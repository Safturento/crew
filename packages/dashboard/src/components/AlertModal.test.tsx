import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AlertModal } from './AlertModal';

describe('AlertModal', () => {
  it('renders title + description + default Cancel/Continue labels', () => {
    render(
      <AlertModal
        title="Remove project?"
        description="This is destructive."
        open
        onOpenChange={() => {}}
        onAction={() => {}}
      />,
    );
    expect(screen.getByText('Remove project?')).toBeInTheDocument();
    expect(screen.getByText('This is destructive.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('fires onAction when the action button is clicked', () => {
    const handler = vi.fn();
    render(
      <AlertModal
        title="X"
        description="Y"
        actionLabel="Remove project"
        open
        onOpenChange={() => {}}
        onAction={handler}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove project' }));
    expect(handler).toHaveBeenCalled();
  });

  it('fires onCancel when the cancel button is clicked', () => {
    const handler = vi.fn();
    render(
      <AlertModal
        title="X"
        description="Y"
        open
        onOpenChange={() => {}}
        onCancel={handler}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handler).toHaveBeenCalled();
  });

  it('applies the action color to the action button', () => {
    render(
      <AlertModal
        title="X"
        description="Y"
        actionLabel="Go"
        open
        onOpenChange={() => {}}
        onAction={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Go' }).dataset.color).toBe('error');
  });
});
