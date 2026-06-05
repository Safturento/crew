import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { RunnerStatus } from './DaemonClient.js';
import { eventStream } from './eventStream.js';
import { defaultClient } from './queries.js';

const RUNNER_STATUS_KEY = ['runner-status'] as const;
const POLL_INTERVAL_MS = 30_000;
const OFFLINE: RunnerStatus = { online: false, lastSeen: null };

/**
 * CREW-217: live runner health for the action layer's degradation. Seeds
 * from `GET /api/runner/status` on mount, then patches the cached value
 * directly from the SSE `runner.status_changed` stream so online/offline
 * flips land without a refetch. A 30s poll is the belt-and-suspenders
 * fallback if SSE stalls — same pattern as the other data hooks. Until the
 * first response lands the runner is treated as offline (the safe default:
 * actions degrade rather than appear available against no runner).
 */
export function useRunnerStatus(): RunnerStatus {
  const qc = useQueryClient();

  useEffect(() => {
    return eventStream.on('runner.status_changed', (raw) => {
      qc.setQueryData<RunnerStatus>(RUNNER_STATUS_KEY, raw as RunnerStatus);
    });
  }, [qc]);

  const { data } = useQuery({
    queryKey: RUNNER_STATUS_KEY,
    queryFn: () => defaultClient.getRunnerStatus(),
    refetchInterval: POLL_INTERVAL_MS,
  });

  return data ?? OFFLINE;
}
