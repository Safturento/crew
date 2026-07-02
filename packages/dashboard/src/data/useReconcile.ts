import { useEffect } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { ReconcileRollup } from 'crew-shared';

import { eventStream } from './eventStream.js';
import { defaultClient } from './queries.js';

const RECONCILE_KEY = ['runner-reconcile'] as const;
const POLL_INTERVAL_MS = 30_000;

/**
 * CREW-311: the housekeeping roll-up from `GET /api/runner/reconcile`
 * (CREW-310) — queued + orphaned agents across all projects. Agents enter and
 * leave the buckets via state transitions, so the `agent.state_changed` SSE
 * edge invalidates the cache; a 30s poll is the belt-and-suspenders fallback
 * (matching `useRunnerStatus`). Backs the runner chip's orphaned-count badge
 * and the supervisor drawer's Reconcile section.
 */
export function useReconcile(): UseQueryResult<ReconcileRollup> {
  const qc = useQueryClient();

  useEffect(() => {
    return eventStream.on('agent.state_changed', () => {
      void qc.invalidateQueries({ queryKey: RECONCILE_KEY });
    });
  }, [qc]);

  return useQuery({
    queryKey: RECONCILE_KEY,
    queryFn: () => defaultClient.reconcile(),
    refetchInterval: POLL_INTERVAL_MS,
    // Opt out of the app-wide `throwOnError: true` (main.tsx): the badge is
    // decorative — a transient failure must not blank the dashboard via the
    // top-level ErrorBoundary.
    throwOnError: false,
  });
}
