import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { LiveProcess } from 'crew-shared';

import { RunnerStatusChip } from './RunnerStatusChip.js';
import { defaultClient } from '../data/queries.js';

let qc: QueryClient;

function wrap(ui: ReactNode) {
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const EMPTY_ROLLUP = { queued: [], orphaned: [] };

function liveProcess(agentKey: string): LiveProcess {
  return {
    agentKey,
    command: 'run',
    pid: 4242,
    pgid: 4242,
    actionRequestId: null,
    spawnedAt: '2026-06-30T10:00:00Z',
    state: 'running',
    project: 'crew',
  };
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(defaultClient, 'reconcile').mockResolvedValue(EMPTY_ROLLUP);
  vi.spyOn(defaultClient, 'getSupervisorLog').mockResolvedValue([]);
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
      processes: [],
    });

    render(wrap(<RunnerStatusChip />));

    const chip = await screen.findByRole('button', { name: /runner online/i });
    expect(chip).toHaveAttribute('data-online', 'true');
  });

  it('reads unhealthy when there is no runner (worktree stack)', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: false,
      lastSeen: null,
      processes: [],
    });

    render(wrap(<RunnerStatusChip />));

    const chip = await screen.findByRole('button', { name: /runner offline/i });
    expect(chip).toHaveAttribute('data-online', 'false');
  });

  // CREW-311: the chip is the supervisor-drawer toggle (the Runner page and
  // its log viewer retire with the runner rework).
  it('opens the supervisor drawer when clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: true,
      lastSeen: Date.now(),
      processes: [],
    });

    render(wrap(<RunnerStatusChip />));

    await user.click(await screen.findByRole('button', { name: /runner online/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Supervisor' })).toBeInTheDocument(),
    );
    expect(screen.getByText('Management log')).toBeInTheDocument();
  });

  // CREW-311: `● Runner · N live` — the live-process count from the runner
  // heartbeat snapshot, per the FINAL grid design (901:2209).
  it('shows the live-process count when the runner is supervising work', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: true,
      lastSeen: Date.now(),
      processes: [liveProcess('CREW-19'), liveProcess('KAN-29')],
    });

    render(wrap(<RunnerStatusChip />));

    const chip = await screen.findByRole('button', { name: /runner online/i });
    await waitFor(() => expect(chip).toHaveTextContent('Runner · 2 live'));
  });

  it('omits the live-process count when nothing is running', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: true,
      lastSeen: Date.now(),
      processes: [],
    });

    render(wrap(<RunnerStatusChip />));

    const chip = await screen.findByRole('button', { name: /runner online/i });
    expect(chip).not.toHaveTextContent(/live/);
  });

  // CREW-311: the orphaned-count badge from GET /api/runner/reconcile —
  // queued is normal transient state, orphaned is the anomaly worth a badge.
  it('shows an orphaned-count badge when the reconcile roll-up has orphans', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: false,
      lastSeen: null,
      processes: [],
    });
    vi.spyOn(defaultClient, 'reconcile').mockResolvedValue({
      queued: [],
      orphaned: [
        { key: 'CREW-11', projectName: 'crew', state: 'orphaned', since: '2026-06-30T09:00:00Z' },
        { key: 'KAN-40', projectName: 'kanban-api', state: 'orphaned', since: '2026-06-30T09:30:00Z' },
      ],
    });

    render(wrap(<RunnerStatusChip />));

    const chip = await screen.findByRole('button', { name: /runner offline/i });
    await waitFor(() => expect(chip).toHaveTextContent('2'));
    expect(chip).toHaveAccessibleName(/2 orphaned/i);
  });

  it('renders no badge when the roll-up is clean', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: false,
      lastSeen: null,
      processes: [],
    });

    render(wrap(<RunnerStatusChip />));

    const chip = await screen.findByRole('button', { name: /runner offline/i });
    expect(chip).not.toHaveTextContent(/\d/);
    expect(chip).not.toHaveAccessibleName(/orphaned/i);
  });
});
