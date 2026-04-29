import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorFallback } from './ErrorFallback.js';

describe('ErrorFallback', () => {
  it('renders the error message', () => {
    render(<ErrorFallback error={new Error('daemon unreachable')} resetErrorBoundary={() => {}} />);
    expect(screen.getByText(/daemon unreachable/)).toBeInTheDocument();
  });

  it('calls resetErrorBoundary when the retry button is clicked', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<ErrorFallback error={new Error('boom')} resetErrorBoundary={reset} />);
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('exposes role="alert" so assistive tech announces it', () => {
    render(<ErrorFallback error={new Error('boom')} resetErrorBoundary={() => {}} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
