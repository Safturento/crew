import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useStartupLog } from './useStartupLog.js';
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

describe('useStartupLog', () => {
  it('fetches the startup log for the key', async () => {
    const spy = vi.spyOn(defaultClient, 'getStartupLog').mockResolvedValue('boom\nexit 1');

    const { result } = renderHook(() => useStartupLog('CREW-241', { enabled: true }), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.data).toBe('boom\nexit 1'));
    expect(spy).toHaveBeenCalledWith('CREW-241');
  });

  it('resolves null when no log exists', async () => {
    vi.spyOn(defaultClient, 'getStartupLog').mockResolvedValue(null);

    const { result } = renderHook(() => useStartupLog('CREW-9', { enabled: true }), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('does not fetch while disabled', () => {
    const spy = vi.spyOn(defaultClient, 'getStartupLog').mockResolvedValue('x');

    renderHook(() => useStartupLog('CREW-1', { enabled: false }), { wrapper: makeWrapper(qc) });

    expect(spy).not.toHaveBeenCalled();
  });
});
