import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { eventStream } from './eventStream.js';
import { defaultClient } from './queries.js';
import type { FinishStep } from './types.js';

const POLL_INTERVAL_MS = 30_000;

interface KeyedPayload {
  key: string;
}

/**
 * CREW-220: the live `crew finish` step checklist for one agent. Seeds from
 * `GET /api/agents/:key/finish-steps` on mount, then invalidates on the SSE
 * `finish_step.changed{key}` ping so each new step lands in the drawer
 * within ~100ms — same SSE-invalidate pattern as `useTimeline`. A 30s poll
 * is the belt-and-suspenders fallback if SSE stalls. Returns the ordered
 * steps (empty until the first response).
 */
export function useFinishSteps(key: string): FinishStep[] {
  const qc = useQueryClient();

  useEffect(() => {
    return eventStream.on('finish_step.changed', (raw) => {
      const d = raw as KeyedPayload;
      if (d.key !== key) return;
      void qc.invalidateQueries({ queryKey: ['agent', key, 'finish-steps'] });
    });
  }, [key, qc]);

  const { data } = useQuery({
    queryKey: ['agent', key, 'finish-steps'],
    queryFn: () => defaultClient.getFinishSteps(key),
    refetchInterval: POLL_INTERVAL_MS,
  });

  return data ?? [];
}
