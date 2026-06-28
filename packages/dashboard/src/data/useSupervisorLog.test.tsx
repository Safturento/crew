import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useSupervisorLog } from './useSupervisorLog.js';
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

describe('useSupervisorLog', () => {
  it('fetches the supervisor management log when enabled', async () => {
    const spy = vi
      .spyOn(defaultClient, 'getSupervisorLog')
      .mockResolvedValue(['runner started', 'reaped 1 dead process']);

    const { result } = renderHook(() => useSupervisorLog({ enabled: true }), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() =>
      expect(result.current.data).toEqual(['runner started', 'reaped 1 dead process']),
    );
    expect(spy).toHaveBeenCalled();
  });

  it('does not fetch while disabled (drawer closed)', () => {
    const spy = vi.spyOn(defaultClient, 'getSupervisorLog').mockResolvedValue([]);

    renderHook(() => useSupervisorLog({ enabled: false }), { wrapper: makeWrapper(qc) });

    expect(spy).not.toHaveBeenCalled();
  });

  it('surfaces an empty array when there is no runner log', async () => {
    vi.spyOn(defaultClient, 'getSupervisorLog').mockResolvedValue([]);

    const { result } = renderHook(() => useSupervisorLog({ enabled: true }), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it('keeps a fetch error local instead of throwing to the app error boundary', async () => {
    const throwingQc = new QueryClient({
      defaultOptions: { queries: { retry: false, throwOnError: true } },
    });
    vi.spyOn(defaultClient, 'getSupervisorLog').mockRejectedValue(new Error('500'));

    const { result } = renderHook(() => useSupervisorLog({ enabled: true }), {
      wrapper: makeWrapper(throwingQc),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    throwingQc.clear();
  });
});
