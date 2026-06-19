import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LiveProcess } from 'crew-shared';

import type { RunnerStatus } from './DaemonClient.js';
import { eventStream } from './eventStream.js';
import { defaultClient } from './queries.js';

const RUNNER_STATUS_KEY = ['runner-status'] as const;
const POLL_INTERVAL_MS = 30_000;
const OFFLINE: RunnerStatus = { online: false, lastSeen: null, processes: [] };

/** The online/offline edge payload (CREW-217) — no `processes`. */
interface StatusEdge {
  online: boolean;
  lastSeen: number | null;
}

/** The live-process snapshot payload (CREW-242) — `processes` only. */
interface SnapshotEdge {
  processes: LiveProcess[];
}

/**
 * CREW-217 / CREW-245: live runner health + the supervisor-held live-process
 * snapshot. Seeds from `GET /api/runner/status` (online/lastSeen + processes)
 * on mount, then patches the cached value directly from two SSE streams so
 * updates land without a refetch:
 *
 * - `runner.status_changed` — the online/offline edge (CREW-242 guards it to
 *   fire only on a health transition); patches `{online, lastSeen}`,
 *   preserving the current process list.
 * - `runner.snapshot_changed` — the per-heartbeat live-process snapshot;
 *   patches `{processes}`, preserving the current online/lastSeen.
 *
 * A 30s poll is the belt-and-suspenders fallback if SSE stalls. Until the
 * first response lands the runner is treated as offline with no processes
 * (the safe default: controls degrade rather than appear available).
 */
export function useRunnerStatus(): RunnerStatus {
  const qc = useQueryClient();

  useEffect(() => {
    const offStatus = eventStream.on('runner.status_changed', (raw) => {
      const edge = raw as StatusEdge;
      qc.setQueryData<RunnerStatus>(RUNNER_STATUS_KEY, (prev) => ({
        ...(prev ?? OFFLINE),
        online: edge.online,
        lastSeen: edge.lastSeen,
      }));
    });
    const offSnapshot = eventStream.on('runner.snapshot_changed', (raw) => {
      const edge = raw as SnapshotEdge;
      qc.setQueryData<RunnerStatus>(RUNNER_STATUS_KEY, (prev) => ({
        ...(prev ?? OFFLINE),
        processes: edge.processes,
      }));
    });
    return () => {
      offStatus();
      offSnapshot();
    };
  }, [qc]);

  const { data } = useQuery({
    queryKey: RUNNER_STATUS_KEY,
    queryFn: () => defaultClient.getRunnerStatus(),
    refetchInterval: POLL_INTERVAL_MS,
  });

  return data ?? OFFLINE;
}
