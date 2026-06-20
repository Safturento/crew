import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { defaultClient } from './queries.js';
import {
  useArchiveFailedStart,
  useCancelRun,
  useDequeue,
  useForceKill,
  usePauseRun,
  useReap,
  useResumeRun,
} from './runnerControls.js';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('runner control hooks', () => {
  it('useCancelRun enqueues a cancel_soft command for the key', async () => {
    const spy = vi.spyOn(defaultClient, 'enqueueRunnerCommand').mockResolvedValue({
      id: 1,
      agentKey: 'CREW-231',
      kind: 'cancel_soft',
      payload: null,
      status: 'pending',
      error: null,
      createdAt: 'x',
      updatedAt: 'x',
    });

    const { result } = renderHook(() => useCancelRun(), { wrapper: wrapper() });
    result.current.mutate('CREW-231');

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ agentKey: 'CREW-231', kind: 'cancel_soft', payload: null });
  });

  it('useForceKill enqueues a cancel_hard command', async () => {
    const spy = vi.spyOn(defaultClient, 'enqueueRunnerCommand').mockResolvedValue({} as never);
    const { result } = renderHook(() => useForceKill(), { wrapper: wrapper() });
    result.current.mutate('CREW-232');
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ agentKey: 'CREW-232', kind: 'cancel_hard', payload: null });
  });

  it('useReap enqueues a reap command', async () => {
    const spy = vi.spyOn(defaultClient, 'enqueueRunnerCommand').mockResolvedValue({} as never);
    const { result } = renderHook(() => useReap(), { wrapper: wrapper() });
    result.current.mutate('CREW-228');
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ agentKey: 'CREW-228', kind: 'reap', payload: null });
  });

  it('useDequeue enqueues a dequeue command', async () => {
    const spy = vi.spyOn(defaultClient, 'enqueueRunnerCommand').mockResolvedValue({} as never);
    const { result } = renderHook(() => useDequeue(), { wrapper: wrapper() });
    result.current.mutate('CREW-240');
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ agentKey: 'CREW-240', kind: 'dequeue', payload: null });
  });

  it('usePauseRun enqueues a pause command for the key', async () => {
    const spy = vi.spyOn(defaultClient, 'enqueueRunnerCommand').mockResolvedValue({} as never);
    const { result } = renderHook(() => usePauseRun(), { wrapper: wrapper() });
    result.current.mutate('CREW-231');
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ agentKey: 'CREW-231', kind: 'pause', payload: null });
  });

  it('useResumeRun enqueues a plain resume command when no message is given', async () => {
    const spy = vi.spyOn(defaultClient, 'enqueueRunnerCommand').mockResolvedValue({} as never);
    const { result } = renderHook(() => useResumeRun(), { wrapper: wrapper() });
    result.current.mutate({ agentKey: 'CREW-231' });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ agentKey: 'CREW-231', kind: 'resume', payload: null });
  });

  it('useResumeRun forwards a steer message as a message command', async () => {
    const spy = vi.spyOn(defaultClient, 'enqueueRunnerCommand').mockResolvedValue({} as never);
    const { result } = renderHook(() => useResumeRun(), { wrapper: wrapper() });
    result.current.mutate({ agentKey: 'CREW-231', message: 'focus on the failing test' });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({
      agentKey: 'CREW-231',
      kind: 'message',
      payload: { message: 'focus on the failing test' },
    });
  });

  it('useArchiveFailedStart acknowledges the key', async () => {
    const spy = vi.spyOn(defaultClient, 'acknowledgeRun').mockResolvedValue(1);
    const { result } = renderHook(() => useArchiveFailedStart(), { wrapper: wrapper() });
    result.current.mutate('CREW-241');
    await waitFor(() => expect(spy).toHaveBeenCalledWith('CREW-241'));
  });
});
