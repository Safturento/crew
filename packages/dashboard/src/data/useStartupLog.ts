import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { defaultClient } from './queries.js';

// While a run is in-flight the startup log keeps growing, so the drawer
// live-tails by refetching on a short interval (mirrors `useSupervisorLog`). The
// daemon also serves an SSE tail at `?follow=1`; the poll keeps the client one
// shape (a plain `string | null`) and avoids an EventSource lifecycle.
const LIVE_TAIL_INTERVAL_MS = 2_000;

interface UseStartupLogOptions {
  /** Only fetch while the drawer is open — cheap when closed. */
  enabled?: boolean;
  /** A still-running run live-tails; an ended one fetches once. */
  live?: boolean;
}

/**
 * CREW-291: a run's raw startup console log for the run drawer. Resolves to the
 * body text, or `null` when the run captured no log (404) — the drawer then
 * falls back to any in-hand `failure.output`. Scoped error handling
 * (`throwOnError: false`) keeps a transient read failure inside the drawer
 * rather than blanking the dashboard via the top-level ErrorBoundary.
 */
export function useStartupLog(
  key: string,
  { enabled = true, live = false }: UseStartupLogOptions = {},
): UseQueryResult<string | null> {
  return useQuery({
    queryKey: ['startup-log', key],
    queryFn: () => defaultClient.getStartupLog(key),
    enabled,
    refetchInterval: enabled && live ? LIVE_TAIL_INTERVAL_MS : false,
    throwOnError: false,
  });
}
