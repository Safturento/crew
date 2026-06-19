import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';

import { TopNav } from './TopNav.js';
import { defaultClient } from '../data/queries.js';

let qc: QueryClient;

function renderTopNav(ui: ReactElement) {
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The mounted RunnerStatusChip reads runner status/logs; stub both so
  // TopNav tests stay offline and deterministic.
  vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
    online: false,
    lastSeen: null,
    processes: [],
  });
  vi.spyOn(defaultClient, 'getRunnerLogs').mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  qc.clear();
});

describe('TopNav', () => {
  it('marks the Agents tab active for the agents-list route', () => {
    renderTopNav(
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
    renderTopNav(
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
    renderTopNav(
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
    renderTopNav(
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
    renderTopNav(
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
    renderTopNav(
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

  it('mounts the runner status chip', () => {
    renderTopNav(
      <TopNav
        route={{ kind: 'agents-list' }}
        attentionCount={0}
        onClearAttention={() => {}}
        onNewRun={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Runner (online|offline)/i })).toBeInTheDocument();
  });
});
