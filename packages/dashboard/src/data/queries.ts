import { useEffect } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { eventStream } from './eventStream.js';
import { HttpDaemonClient, type RefreshPrStatusResponse } from './HttpDaemonClient.js';
import type {
  AgentDetail,
  AggregateMetrics,
  ProjectDetailResponse,
  StateTransition,
  TranscriptEvent,
} from './types.js';

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

    // CREW-178: each new tool_call shifts the tokens_by_tool aggregate. The
    // server emits tool_calls.changed on every batch so the drawer's
    // TokensByTool composite refreshes within ~100ms of new activity.
    const offToolCalls = eventStream.on('tool_calls.changed', (raw) => {
      const d = raw as KeyedPayload;
      if (d.key !== key) return;
      void qc.invalidateQueries({ queryKey: ['agent', key] });
    });

    return () => {
      offState();
      offRunCompleted();
      offToolCalls();
    };
  }, [key, qc]);

  return useQuery({
    queryKey: ['agent', key],
    queryFn: () => defaultClient.getAgent(key),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useStateHistory(key: string): UseQueryResult<{ transitions: StateTransition[] }> {
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

/**
 * Layer-1 metrics aggregate for one cohort. `baseline=true` is the
 * pre-rollout baseline; `false` is the current cohort. Polls on the shared
 * 30s interval — metrics shift slowly, so no SSE invalidation is wired.
 */
export function useMetrics(baseline: boolean): UseQueryResult<AggregateMetrics> {
  return useQuery({
    queryKey: ['metrics', baseline ? 'baseline' : 'current'],
    queryFn: () => defaultClient.getMetrics(baseline),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useProject(slug: string): UseQueryResult<ProjectDetailResponse> {
  return useQuery({
    queryKey: ['project', slug],
    queryFn: () => defaultClient.getProject(slug),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * CREW-202: mutation hook backing the drawer's "Refresh PR" button.
 * The daemon either no-ops or writes a `pr_open → pr_merged` transition;
 * we invalidate the agent + state-history + list views so the change
 * lands in the UI immediately (SSE picks up the same event in parallel).
 */
export function useRefreshPrStatus(
  key: string,
): UseMutationResult<RefreshPrStatusResponse, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => defaultClient.refreshPrStatus(key),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agent', key] });
      void qc.invalidateQueries({ queryKey: ['agent', key, 'state-history'] });
      void qc.invalidateQueries({ queryKey: ['agents'] });
    },
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
