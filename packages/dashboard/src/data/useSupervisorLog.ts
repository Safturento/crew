import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { defaultClient } from './queries.js';

const DEFAULT_TAIL = 200;
// The supervisor log is the management slice of the host `runner.log`, which
// has no SSE ping (the daemon only tails it on request), so the drawer
// live-tails by refetching on a short interval while it's open. 2s keeps it
// lively without hammering the file read — matching `useRunnerLogs`.
const LIVE_TAIL_INTERVAL_MS = 2_000;

interface UseSupervisorLogOptions {
  /** Only poll while the drawer is open — cheap when it's closed. */
  enabled?: boolean;
  /** Number of trailing lines to request (daemon default when omitted). */
  tail?: number;
}

/**
 * CREW-292: tail the supervisor's process-management log (spawn/respawn/
 * heartbeat/reap) for the supervisor drawer. Seeds from
 * `GET /api/runner/supervisor-log` and live-tails on a short interval while
 * `enabled` (the drawer is open). Resolves to `[]` when no runner log exists —
 * the normal state on a worktree stack — which the drawer renders as an empty
 * state rather than an error.
 */
export function useSupervisorLog({
  enabled = true,
  tail = DEFAULT_TAIL,
}: UseSupervisorLogOptions = {}): UseQueryResult<string[]> {
  return useQuery({
    queryKey: ['supervisor-log', tail],
    queryFn: () => defaultClient.getSupervisorLog(tail),
    enabled,
    refetchInterval: enabled ? LIVE_TAIL_INTERVAL_MS : false,
    // Opt out of the app-wide `throwOnError: true` (main.tsx): a transient
    // failure on this user-opened, every-2s poll must stay scoped to the
    // drawer, not blank the whole dashboard via the top-level ErrorBoundary.
    throwOnError: false,
  });
}
