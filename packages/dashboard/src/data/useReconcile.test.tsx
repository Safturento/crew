import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useReconcile } from './useReconcile.js';
import { defaultClient } from './queries.js';
import { eventStream } from './eventStream.js';

let qc: QueryClient;
let handlers: Map<string, Set<(data: unknown) => void>>;

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

const ROLLUP = {
  queued: [
    {
      key: 'KAN-23',
      projectName: 'kanban-api',
      state: 'queued' as const,
      since: '2026-06-30T10:00:00Z',
    },
  ],
  orphaned: [
    {
      key: 'CREW-11',
      projectName: 'crew',
      state: 'orphaned' as const,
      since: '2026-06-30T09:00:00Z',
    },
  ],
};

describe('useReconcile', () => {
  it('fetches the reconcile roll-up', async () => {
    const spy = vi.spyOn(defaultClient, 'reconcile').mockResolvedValue(ROLLUP);

    const { result } = renderHook(() => useReconcile(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.data).toEqual(ROLLUP));
    expect(spy).toHaveBeenCalled();
  });

  it('refetches when an agent.state_changed SSE edge lands', async () => {
    const spy = vi.spyOn(defaultClient, 'reconcile').mockResolvedValue(ROLLUP);

    renderHook(() => useReconcile(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    act(() => {
      fire('agent.state_changed', { key: 'CREW-11', to: 'orphaned' });
    });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
