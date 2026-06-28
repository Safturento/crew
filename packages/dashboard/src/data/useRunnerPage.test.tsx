import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { RunnerPage } from 'crew-shared';

import { eventStream } from './eventStream.js';
import { useRunnerPage } from './useRunnerPage.js';
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

const PAGE: RunnerPage = {
  failedToStart: [
    {
      key: 'CREW-241',
      command: 'run',
      project: '~/code/crew',
      failedAt: '2026-06-25T14:30:41.000Z',
      failure: { check: 'repo-config', headline: 'boom', remediation: 'fix', output: 'exit 1' },
    },
  ],
  queued: [],
  recentlyEnded: [],
};

describe('useRunnerPage', () => {
  it('seeds the three lists from defaultClient.getRunnerPage on mount', async () => {
    const spy = vi.spyOn(defaultClient, 'getRunnerPage').mockResolvedValue(PAGE);

    const { result } = renderHook(() => useRunnerPage(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.failedToStart).toHaveLength(1));
    expect(spy).toHaveBeenCalledOnce();
    expect(result.current.failedToStart[0]?.key).toBe('CREW-241');
  });

  it('defaults to empty lists before the query resolves', () => {
    vi.spyOn(defaultClient, 'getRunnerPage').mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useRunnerPage(), { wrapper: makeWrapper(qc) });

    expect(result.current).toEqual({ failedToStart: [], queued: [], recentlyEnded: [] });
  });

  it('refetches when a run.completed event fires', async () => {
    const spy = vi.spyOn(defaultClient, 'getRunnerPage').mockResolvedValue(PAGE);

    renderHook(() => useRunnerPage(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(spy).toHaveBeenCalledOnce());

    fire('run.completed', { key: 'CREW-241', ts: 1 });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
