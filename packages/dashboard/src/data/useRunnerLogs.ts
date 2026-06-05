import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { defaultClient } from './queries.js';

const DEFAULT_TAIL = 200;
// The runner log has no SSE ping (it's a host file the daemon only tails on
// request), so the viewer live-tails by refetching on a short interval while
// it's open. 2s keeps it lively without hammering the file read.
const LIVE_TAIL_INTERVAL_MS = 2_000;

interface UseRunnerLogsOptions {
  /** Only poll while the viewer is open — cheap when the modal is closed. */
  enabled?: boolean;
  /** Number of trailing lines to request (daemon default when omitted). */
  tail?: number;
}

/**
 * CREW-221: tail the host runner's log for the log viewer. Seeds from
 * `GET /api/runner/logs` and live-tails on a short interval while `enabled`
 * (the viewer is open). Resolves to `[]` when no runner log exists — the
 * normal state on a worktree stack — which the viewer renders as an empty
 * state rather than an error.
 */
export function useRunnerLogs({
  enabled = true,
  tail = DEFAULT_TAIL,
}: UseRunnerLogsOptions = {}): UseQueryResult<string[]> {
  return useQuery({
    queryKey: ['runner-logs', tail],
    queryFn: () => defaultClient.getRunnerLogs(tail),
    enabled,
    refetchInterval: enabled ? LIVE_TAIL_INTERVAL_MS : false,
    // Opt out of the app-wide `throwOnError: true` (main.tsx): a transient
    // failure on this user-opened, every-2s poll must stay scoped to the log
    // viewer, not blank the whole dashboard via the top-level ErrorBoundary.
    throwOnError: false,
  });
}
