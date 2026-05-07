import { useEffect } from 'react';
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { eventStream } from './eventStream.js';
import { HttpDaemonClient } from './HttpDaemonClient.js';
import type { AgentDetail, StateTransition, TranscriptEvent } from './types.js';

/**
 * Queries-layer client. The hooks all reach for `defaultClient` so call
 * sites stay terse (`useAgent(key)`); tests substitute via vi.spyOn on
 * the singleton's methods. Polling falls back to a 30s belt-and-
 * suspenders refetch in case SSE stalls.
 */
export const defaultClient = new HttpDaemonClient();

const POLL_INTERVAL_MS = 30_000;

interface AgentStateChangedPayload {
  key: string;
  to: string;
}

interface KeyedPayload {
  key: string;
}

export function useAgent(key: string): UseQueryResult<AgentDetail> {
  const qc = useQueryClient();

  useEffect(() => {
    const offState = eventStream.on('agent.state_changed', (raw) => {
      const d = raw as AgentStateChangedPayload;
      if (d.key !== key) return;
      qc.setQueryData<AgentDetail>(['agent', key], (old) =>
        old ? { ...old, state: d.to as AgentDetail['state'] } : old,
      );
    });

    const offRunCompleted = eventStream.on('run.completed', (raw) => {
      const d = raw as KeyedPayload;
      if (d.key !== key) return;
      void qc.invalidateQueries({ queryKey: ['agent', key] });
      void qc.invalidateQueries({ queryKey: ['agents'] });
    });

    return () => {
      offState();
      offRunCompleted();
    };
  }, [key, qc]);

  return useQuery({
    queryKey: ['agent', key],
    queryFn: () => defaultClient.getAgent(key),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useStateHistory(
  key: string,
): UseQueryResult<{ transitions: StateTransition[] }> {
  const qc = useQueryClient();

  useEffect(() => {
    const off = eventStream.on('agent.state_changed', (raw) => {
      const d = raw as KeyedPayload;
      if (d.key !== key) return;
      void qc.invalidateQueries({ queryKey: ['agent', key, 'state-history'] });
    });
    return off;
  }, [key, qc]);

  return useQuery({
    queryKey: ['agent', key, 'state-history'],
    queryFn: () => defaultClient.getStateHistory(key),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useTimeline(
  key: string,
): UseQueryResult<{ events: TranscriptEvent[]; warnings?: string[] }> {
  const qc = useQueryClient();

  useEffect(() => {
    const off = eventStream.on('tool_calls.changed', (raw) => {
      const d = raw as KeyedPayload;
      if (d.key !== key) return;
      void qc.invalidateQueries({ queryKey: ['agent', key, 'timeline'] });
    });
    return off;
  }, [key, qc]);

  return useQuery({
    queryKey: ['agent', key, 'timeline'],
    queryFn: () => defaultClient.getTimeline(key),
    refetchInterval: POLL_INTERVAL_MS,
  });
}
