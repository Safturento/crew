import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { eventStream } from './eventStream.js';
import { useRunnerStatus } from './useRunnerStatus.js';
import { defaultClient } from './queries.js';

type Handler = (data: unknown) => void;

let handlers: Map<string, Set<Handler>>;
let qc: QueryClient;

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  handlers = new Map();
  vi.spyOn(eventStream, 'on').mockImplementation((event, fn) => {
    let bucket = handlers.get(event);
    if (!bucket) {
      bucket = new Set();
      handlers.set(event, bucket);
    }
    bucket.add(fn);
    return () => {
      bucket!.delete(fn);
    };
  });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.restoreAllMocks();
  qc.clear();
});

function fire(event: string, data: unknown): void {
  const bucket = handlers.get(event);
  if (!bucket) return;
  for (const fn of bucket) fn(data);
}

describe('useRunnerStatus', () => {
  it('seeds from defaultClient.getRunnerStatus on mount', async () => {
    const spy = vi
      .spyOn(defaultClient, 'getRunnerStatus')
      .mockResolvedValue({ online: true, lastSeen: 1234 });

    const { result } = renderHook(() => useRunnerStatus(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.online).toBe(true));
    expect(spy).toHaveBeenCalledOnce();
    expect(result.current).toEqual({ online: true, lastSeen: 1234 });
  });

  it('defaults to offline before the query resolves', () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useRunnerStatus(), { wrapper: makeWrapper(qc) });

    expect(result.current).toEqual({ online: false, lastSeen: null });
  });

  it('patches state when runner.status_changed fires, without a refetch', async () => {
    const spy = vi
      .spyOn(defaultClient, 'getRunnerStatus')
      .mockResolvedValue({ online: true, lastSeen: 1234 });

    const { result } = renderHook(() => useRunnerStatus(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.online).toBe(true));

    fire('runner.status_changed', { online: false, lastSeen: 5678 });

    await waitFor(() => expect(result.current.online).toBe(false));
    expect(result.current).toEqual({ online: false, lastSeen: 5678 });
    // SSE patch updates the cache directly — no second fetch.
    expect(spy).toHaveBeenCalledOnce();
  });
});
