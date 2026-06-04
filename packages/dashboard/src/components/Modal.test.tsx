import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from './Modal';

describe('Modal', () => {
  it('renders the title + children when open', () => {
    render(
      <Modal title="Register" open onOpenChange={() => {}}>
        <p>body content</p>
      </Modal>,
    );
    expect(screen.getByText('Register')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('hides the close button when showClose=false', () => {
    render(
      <Modal title="X" open showClose={false} onOpenChange={() => {}}>
        <p />
      </Modal>,
    );
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });

  it('calls onOpenChange(false) when close is clicked', () => {
    const handler = vi.fn();
    render(
      <Modal title="X" open onOpenChange={handler}>
        <p />
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(handler).toHaveBeenCalledWith(false);
  });
});
