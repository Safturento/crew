import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useRunnerLogs } from './useRunnerLogs.js';
import { defaultClient } from './queries.js';

let qc: QueryClient;

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.restoreAllMocks();
  qc.clear();
});

describe('useRunnerLogs', () => {
  it('fetches the runner logs when enabled', async () => {
    const spy = vi
      .spyOn(defaultClient, 'getRunnerLogs')
      .mockResolvedValue(['boot', 'claimed CREW-1']);

    const { result } = renderHook(() => useRunnerLogs({ enabled: true }), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.data).toEqual(['boot', 'claimed CREW-1']));
    expect(spy).toHaveBeenCalled();
  });

  it('does not fetch while disabled (viewer closed)', () => {
    const spy = vi.spyOn(defaultClient, 'getRunnerLogs').mockResolvedValue([]);

    renderHook(() => useRunnerLogs({ enabled: false }), { wrapper: makeWrapper(qc) });

    expect(spy).not.toHaveBeenCalled();
  });

  it('surfaces an empty array when there is no runner log', async () => {
    vi.spyOn(defaultClient, 'getRunnerLogs').mockResolvedValue([]);

    const { result } = renderHook(() => useRunnerLogs({ enabled: true }), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it('keeps a fetch error local instead of throwing to the app error boundary', async () => {
    // The app's runtime QueryClient sets throwOnError: true (main.tsx), which
    // would otherwise route a transient log-fetch error to the single app-wide
    // ErrorBoundary and blank the whole dashboard while the viewer is open.
    // The hook must opt out so the error stays scoped to the viewer.
    const throwingQc = new QueryClient({
      defaultOptions: { queries: { retry: false, throwOnError: true } },
    });
    vi.spyOn(defaultClient, 'getRunnerLogs').mockRejectedValue(new Error('500'));

    const { result } = renderHook(() => useRunnerLogs({ enabled: true }), {
      wrapper: makeWrapper(throwingQc),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    throwingQc.clear();
  });
});
