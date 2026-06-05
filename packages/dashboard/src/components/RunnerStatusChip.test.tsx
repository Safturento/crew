import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { RunnerStatusChip } from './RunnerStatusChip.js';
import { defaultClient } from '../data/queries.js';

let qc: QueryClient;

function wrap(ui: ReactNode) {
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(defaultClient, 'getRunnerLogs').mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  qc.clear();
});

describe('RunnerStatusChip', () => {
  it('reads healthy when the runner is online', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: true,
      lastSeen: Date.now(),
    });

    render(wrap(<RunnerStatusChip />));

    const chip = await screen.findByRole('button', { name: /runner online/i });
    expect(chip).toHaveAttribute('data-online', 'true');
  });

  it('reads unhealthy when there is no runner (worktree stack)', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: false,
      lastSeen: null,
    });

    render(wrap(<RunnerStatusChip />));

    const chip = await screen.findByRole('button', { name: /runner offline/i });
    expect(chip).toHaveAttribute('data-online', 'false');
  });

  it('opens the log viewer when clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: true,
      lastSeen: Date.now(),
    });

    render(wrap(<RunnerStatusChip />));

    await user.click(await screen.findByRole('button', { name: /runner online/i }));

    await waitFor(() => expect(screen.getByText('Runner logs')).toBeInTheDocument());
  });
});
