import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RunnerPage } from 'crew-shared';

import { eventStream } from './eventStream.js';
import { defaultClient } from './queries.js';

const RUNNER_PAGE_KEY = ['runner-page'] as const;
const POLL_INTERVAL_MS = 30_000;
const EMPTY: RunnerPage = { failedToStart: [], queued: [], recentlyEnded: [] };

/**
 * CREW-291: the Runner page's read surface — `failedToStart` / `queued` /
 * `recentlyEnded` from `GET /api/runner/page` (CREW-290 / T2). Seeds from the
 * client on mount and invalidates on `run.completed` so a run landing in a
 * terminal state moves into Recently-ended promptly; a 30s poll is the
 * belt-and-suspenders fallback (failed-start / queued transitions have no
 * dedicated SSE edge). Until the first response lands the three lists are empty
 * (the sections render their empty/ hidden states rather than stale data).
 */
export function useRunnerPage(): RunnerPage {
  const qc = useQueryClient();

  useEffect(() => {
    const off = eventStream.on('run.completed', () => {
      void qc.invalidateQueries({ queryKey: RUNNER_PAGE_KEY });
    });
    return off;
  }, [qc]);

  const { data } = useQuery({
    queryKey: RUNNER_PAGE_KEY,
    queryFn: () => defaultClient.getRunnerPage(),
    refetchInterval: POLL_INTERVAL_MS,
  });

  return data ?? EMPTY;
}
