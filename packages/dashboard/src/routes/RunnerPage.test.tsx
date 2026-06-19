import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { LiveProcess } from 'crew-shared';

import { RunnerPage } from './RunnerPage.js';
import { defaultClient } from '../data/queries.js';
import type { Agent } from '../data/types.js';

let qc: QueryClient;

function wrap(ui: ReactNode) {
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const PROC: LiveProcess = {
  agentKey: 'CREW-231',
  command: 'run',
  pid: 10,
  pgid: 10,
  actionRequestId: null,
  spawnedAt: new Date(Date.now() - 60_000).toISOString(),
  state: 'running',
  project: '~/code/crew',
};

const agent = (over: Partial<Agent>): Agent => ({
  key: 'CREW-1',
  projectName: 'crew',
  ticketTitle: 'x',
  state: 'running',
  startedAt: new Date().toISOString(),
  tokens: 0,
  ...over,
});

beforeEach(() => {
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  qc.clear();
});

describe('RunnerPage', () => {
  it('renders the header and the supervisor card from runner status', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: true,
      lastSeen: Date.now(),
      processes: [PROC],
    });

    render(wrap(<RunnerPage agents={[]} />));

    expect(screen.getByRole('heading', { name: 'Runner' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('CREW-231')).toBeInTheDocument());
    expect(screen.getByText('Live processes')).toBeInTheDocument();
  });

  it('derives Unmanaged from running agents missing from the live snapshot', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: true,
      lastSeen: Date.now(),
      processes: [PROC], // CREW-231 is live
    });

    // CREW-228 is running in the DB but not in the snapshot → Unmanaged.
    const agents = [
      agent({ key: 'CREW-231', state: 'running' }),
      agent({ key: 'CREW-228', state: 'running' }),
    ];
    render(wrap(<RunnerPage agents={agents} />));

    // Once the snapshot loads, only CREW-228 (absent from it) remains unmanaged
    // — the live CREW-231 is filtered out (it renders in Live processes instead).
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Reap' })).toHaveLength(1));
    expect(screen.getByText('CREW-228')).toBeInTheDocument();
  });

  it('Reap on an unmanaged row enqueues a reap command', async () => {
    const user = userEvent.setup();
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: true,
      lastSeen: Date.now(),
      processes: [],
    });
    const spy = vi.spyOn(defaultClient, 'enqueueRunnerCommand').mockResolvedValue({} as never);

    render(wrap(<RunnerPage agents={[agent({ key: 'CREW-228', state: 'running' })]} />));

    await user.click(await screen.findByRole('button', { name: 'Reap' }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ agentKey: 'CREW-228', kind: 'reap', payload: null }),
    );
  });

  it('hides the empty attention sections and shows the recently-ended empty state', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: false,
      lastSeen: null,
      processes: [],
    });

    render(wrap(<RunnerPage agents={[]} />));

    await waitFor(() => expect(screen.getByText('Nothing ended recently')).toBeInTheDocument());
    expect(screen.queryByText('Failed to start')).toBeNull();
    expect(screen.queryByText('⚠ Unmanaged runs')).toBeNull();
    expect(screen.queryByText('Queued actions')).toBeNull();
  });
});
