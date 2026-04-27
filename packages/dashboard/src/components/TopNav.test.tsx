import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TopNav } from './TopNav.js';

describe('TopNav', () => {
  it('marks the Agents tab active for the agents-list route', () => {
    render(
      <TopNav
        route={{ kind: 'agents-list' }}
        attentionCount={0}
        onClearAttention={() => {}}
        onNewRun={() => {}}
      />,
    );
    expect(screen.getByRole('link', { name: 'Agents' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current');
  });

  it('marks the Projects tab active for the projects route', () => {
    render(
      <TopNav
        route={{ kind: 'projects' }}
        attentionCount={0}
        onClearAttention={() => {}}
        onNewRun={() => {}}
      />,
    );
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
  });

  it('disables the Clear attention button when count is 0', () => {
    render(
      <TopNav
        route={{ kind: 'agents-list' }}
        attentionCount={0}
        onClearAttention={() => {}}
        onNewRun={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Clear attention/ })).toBeDisabled();
  });

  it('shows the count badge when attentionCount > 0', () => {
    render(
      <TopNav
        route={{ kind: 'agents-list' }}
        attentionCount={3}
        onClearAttention={() => {}}
        onNewRun={() => {}}
      />,
    );
    const button = screen.getByRole('button', { name: /Clear attention/ });
    expect(button).not.toBeDisabled();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('fires onClearAttention when the button is clicked', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <TopNav
        route={{ kind: 'agents-list' }}
        attentionCount={2}
        onClearAttention={onClear}
        onNewRun={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Clear attention/ }));
    expect(onClear).toHaveBeenCalled();
  });

  it('fires onNewRun when the + New Run button is clicked', async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    render(
      <TopNav
        route={{ kind: 'agents-list' }}
        attentionCount={0}
        onClearAttention={() => {}}
        onNewRun={onNew}
      />,
    );
    await user.click(screen.getByRole('button', { name: /New Run/ }));
    expect(onNew).toHaveBeenCalled();
  });
});
