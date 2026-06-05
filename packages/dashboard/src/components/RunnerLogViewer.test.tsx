import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { RunnerLogViewer } from './RunnerLogViewer.js';
import { defaultClient } from '../data/queries.js';

let qc: QueryClient;

function wrap(ui: ReactNode) {
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.restoreAllMocks();
  qc.clear();
});

describe('RunnerLogViewer', () => {
  it('tails the runner log lines when open', async () => {
    vi.spyOn(defaultClient, 'getRunnerLogs').mockResolvedValue([
      'runner started',
      'claimed CREW-1',
    ]);

    render(wrap(<RunnerLogViewer open onOpenChange={() => {}} />));

    expect(await screen.findByText('runner started')).toBeInTheDocument();
    expect(screen.getByText('claimed CREW-1')).toBeInTheDocument();
  });

  it('shows an empty state when there is no runner log', async () => {
    const spy = vi.spyOn(defaultClient, 'getRunnerLogs').mockResolvedValue([]);

    render(wrap(<RunnerLogViewer open onOpenChange={() => {}} />));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(await screen.findByText(/no runner logs/i)).toBeInTheDocument();
  });

  it('does not fetch while closed', () => {
    const spy = vi.spyOn(defaultClient, 'getRunnerLogs').mockResolvedValue([]);

    render(wrap(<RunnerLogViewer open={false} onOpenChange={() => {}} />));

    expect(spy).not.toHaveBeenCalled();
  });

  it('shows an inline error state (not the empty state) when the tail fails', async () => {
    // Mirror the app's throwOnError: true so a regression that drops the hook's
    // local opt-out would crash the render here instead of showing the message.
    qc = new QueryClient({ defaultOptions: { queries: { retry: false, throwOnError: true } } });
    vi.spyOn(defaultClient, 'getRunnerLogs').mockRejectedValue(new Error('500'));

    render(wrap(<RunnerLogViewer open onOpenChange={() => {}} />));

    expect(await screen.findByText(/couldn't load runner logs/i)).toBeInTheDocument();
    expect(screen.queryByText(/no runner logs/i)).not.toBeInTheDocument();
  });
});
