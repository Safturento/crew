import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Row } from './Row.js';

describe('Row', () => {
  it('renders the status slot, title, subheader, and actions', () => {
    render(
      <Row
        statusSlot={<span>status</span>}
        title="A title"
        subheader={<span>meta</span>}
        actions={<button>Do it</button>}
      />,
    );
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText('A title')).toBeInTheDocument();
    expect(screen.getByText('meta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Do it' })).toBeInTheDocument();
  });

  it('holds the status slot in a fixed 96px (w-24) column', () => {
    render(<Row statusSlot={<span data-testid="s">s</span>} title="t" />);
    expect(screen.getByTestId('s').parentElement).toHaveClass('w-24');
  });

  it('tints the row with literal STATE_CLASSES tokens for an attention accent', () => {
    render(<Row statusSlot={<span>s</span>} title="t" accent="error" ariaLabel="r" onActivate={() => {}} />);
    const row = screen.getByRole('button', { name: 'r' });
    expect(row.className).toContain('border-red-500');
    expect(row.className).toContain('bg-red-1050');
    expect(row).toHaveAttribute('data-attention', 'error');
  });

  it('renders the pulsing left bar for an attention accent', () => {
    const { container } = render(<Row statusSlot={<span>s</span>} title="t" accent="waiting" />);
    expect(container.querySelector('.animate-att-pulse')).toBeTruthy();
  });

  it('uses a neutral border with no pulse for a non-attention accent', () => {
    const { container } = render(<Row statusSlot={<span>s</span>} title="t" accent="running" />);
    const row = container.firstChild as HTMLElement;
    expect(row.className).toContain('border-white/10');
    expect(row).not.toHaveAttribute('data-attention');
    expect(container.querySelector('.animate-att-pulse')).toBeNull();
  });

  it('uses a neutral border when no accent is given', () => {
    const { container } = render(<Row statusSlot={<span>s</span>} title="t" />);
    expect((container.firstChild as HTMLElement).className).toContain('border-white/10');
  });

  it('is a clickable button that fires onActivate on click', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<Row statusSlot={<span>s</span>} title="t" ariaLabel="my row" onActivate={onActivate} />);
    await user.click(screen.getByRole('button', { name: 'my row' }));
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it('fires onActivate on Enter/Space when the row itself is focused', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<Row statusSlot={<span>s</span>} title="t" ariaLabel="my row" onActivate={onActivate} />);
    const row = screen.getByRole('button', { name: 'my row' });
    row.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('does not fire onActivate when a keydown bubbles up from an inner control', async () => {
    // A focusable inner element that does NOT natively click on Enter (so we
    // isolate the row's keydown guard from native button-activation, which
    // callers suppress with their own stopPropagation wrappers — see AgentRow).
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      <Row
        statusSlot={<span>s</span>}
        title="t"
        ariaLabel="my row"
        onActivate={onActivate}
        actions={<input aria-label="inner" />}
      />,
    );
    const inner = screen.getByRole('textbox', { name: 'inner' });
    inner.focus();
    await user.keyboard('{Enter}');
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('renders a plain non-interactive row when onActivate is omitted', () => {
    render(<Row statusSlot={<span>s</span>} title="t" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
