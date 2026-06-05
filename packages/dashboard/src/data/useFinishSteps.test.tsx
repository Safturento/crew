import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { eventStream } from './eventStream.js';
import { useFinishSteps } from './useFinishSteps.js';
import { defaultClient } from './queries.js';
import type { FinishStep } from './types.js';

type Handler = (data: unknown) => void;

let handlers: Map<string, Set<Handler>>;
let qc: QueryClient;

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function step(overrides: Partial<FinishStep>): FinishStep {
  return {
    key: 'KAN-1',
    index: 0,
    label: 'git fetch --prune origin',
    status: 'ok',
    detail: null,
    ts: 1000,
    ...overrides,
  };
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

describe('useFinishSteps', () => {
  it('seeds from defaultClient.getFinishSteps on mount', async () => {
    const spy = vi
      .spyOn(defaultClient, 'getFinishSteps')
      .mockResolvedValue([step({ index: 0, label: 'git branch -D KAN-1' })]);

    const { result } = renderHook(() => useFinishSteps('KAN-1'), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(spy).toHaveBeenCalledWith('KAN-1');
    expect(result.current[0]?.label).toBe('git branch -D KAN-1');
  });

  it('refetches when finish_step.changed fires for the same key', async () => {
    const spy = vi
      .spyOn(defaultClient, 'getFinishSteps')
      .mockResolvedValueOnce([step({ index: 0 })])
      .mockResolvedValueOnce([step({ index: 0 }), step({ index: 1, label: 'jira KAN-1 → Done' })]);

    const { result } = renderHook(() => useFinishSteps('KAN-1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current).toHaveLength(1));

    fire('finish_step.changed', { key: 'KAN-1' });

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('ignores finish_step.changed for a different key', async () => {
    const spy = vi.spyOn(defaultClient, 'getFinishSteps').mockResolvedValue([step({ index: 0 })]);

    const { result } = renderHook(() => useFinishSteps('KAN-1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current).toHaveLength(1));

    fire('finish_step.changed', { key: 'OTHER-9' });

    // No refetch for an unrelated agent.
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
