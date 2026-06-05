import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';
import { eventStream } from './eventStream.js';
import { useActionToasts, useEnqueueAction } from './actions.js';
import { defaultClient } from './queries.js';
import type { ActionRequest } from 'crew-shared';

type Handler = (data: unknown) => void;

const SAMPLE_ACTION: ActionRequest = {
  id: 1,
  kind: 'run',
  ticketKey: 'CREW-1',
  project: 'crew',
  payload: { kind: 'run' },
  status: 'pending',
  error: null,
  createdAt: '2026-06-04T00:00:00Z',
  updatedAt: '2026-06-04T00:00:00Z',
};

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
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  qc.clear();
});

function fire(event: string, data: unknown): void {
  const bucket = handlers.get(event);
  if (!bucket) return;
  for (const fn of bucket) fn(data);
}

describe('useEnqueueAction', () => {
  it('enqueues via defaultClient.enqueueAction and toasts on success', async () => {
    const spy = vi.spyOn(defaultClient, 'enqueueAction').mockResolvedValue(SAMPLE_ACTION);

    const { result } = renderHook(() => useEnqueueAction(), { wrapper: makeWrapper(qc) });
    result.current.mutate({ kind: 'run', project: 'crew', ticketKey: 'CREW-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ kind: 'run', project: 'crew', ticketKey: 'CREW-1' });
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/run queued/i));
  });

  it('uses a kind-specific label in the success toast', async () => {
    vi.spyOn(defaultClient, 'enqueueAction').mockResolvedValue({
      ...SAMPLE_ACTION,
      kind: 'finish',
      payload: { kind: 'finish' },
    });

    const { result } = renderHook(() => useEnqueueAction(), { wrapper: makeWrapper(qc) });
    result.current.mutate({ kind: 'finish', project: 'crew', ticketKey: 'CREW-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/finish queued/i));
  });

  it('toasts an error when the enqueue rejects', async () => {
    vi.spyOn(defaultClient, 'enqueueAction').mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useEnqueueAction(), { wrapper: makeWrapper(qc) });
    result.current.mutate({ kind: 'run', project: 'crew', ticketKey: 'CREW-1' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/boom/));
  });
});

describe('useActionToasts', () => {
  it('toasts an error when an action.changed reports failed', async () => {
    renderHook(() => useActionToasts(), { wrapper: makeWrapper(qc) });

    fire('action.changed', { id: 9, kind: 'run', key: 'CREW-7', status: 'failed' });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/CREW-7/)),
    );
  });

  it('toasts success when an action.changed reports launched', async () => {
    renderHook(() => useActionToasts(), { wrapper: makeWrapper(qc) });

    fire('action.changed', { id: 9, kind: 'fix_pr', key: 'CREW-7', status: 'launched' });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/CREW-7/)),
    );
  });

  it('stays quiet for intermediate statuses (pending/claimed/launching)', async () => {
    renderHook(() => useActionToasts(), { wrapper: makeWrapper(qc) });

    fire('action.changed', { id: 9, kind: 'run', key: 'CREW-7', status: 'pending' });
    fire('action.changed', { id: 9, kind: 'run', key: 'CREW-7', status: 'claimed' });
    fire('action.changed', { id: 9, kind: 'run', key: 'CREW-7', status: 'launching' });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
