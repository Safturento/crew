import { useEffect } from 'react';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ActionKind, ActionRequest, ActionStatus, EnqueueAction } from 'crew-shared';

import { eventStream } from './eventStream.js';
import { defaultClient } from './queries.js';

/**
 * CREW-217: the App-level action layer. `useEnqueueAction` POSTs a
 * dashboard-triggered verb (`run` / `fix_pr` / `finish`) to the daemon's
 * queue and toasts the outcome; `useActionToasts` listens on the SSE
 * `action.changed` stream and toasts the terminal launch result (failed /
 * launched), since enqueue only confirms the request was *queued*, not run.
 */

const ACTION_LABELS: Record<ActionKind, string> = {
  run: 'Run',
  fix_pr: 'Fix PR',
  finish: 'Finish',
};

interface ActionChangedPayload {
  id: number;
  kind: ActionKind;
  key: string;
  status: ActionStatus;
}

/**
 * Mutation hook backing the QuickAction buttons. On a successful enqueue it
 * toasts "<Verb> queued"; a rejected enqueue (validation, unreachable
 * daemon) toasts the error. The runner draining the queue is reported
 * separately over SSE — see `useActionToasts`.
 */
export function useEnqueueAction(): UseMutationResult<ActionRequest, Error, EnqueueAction> {
  return useMutation<ActionRequest, Error, EnqueueAction>({
    mutationFn: (input) => defaultClient.enqueueAction(input),
    onSuccess: (action) => {
      toast.success(`${ACTION_LABELS[action.kind]} queued`);
    },
    onError: (error, input) => {
      toast.error(`Couldn't queue ${ACTION_LABELS[input.kind]}: ${error.message}`);
    },
  });
}

/**
 * Subscribes to `action.changed` for the lifetime of the mounting component
 * and toasts the terminal launch outcome: `failed` → error, `launched` →
 * success. Intermediate transitions (pending/claimed/launching) are quiet.
 * Mount once near the app root.
 */
export function useActionToasts(): void {
  useEffect(() => {
    return eventStream.on('action.changed', (raw) => {
      const d = raw as ActionChangedPayload;
      const label = ACTION_LABELS[d.kind];
      if (d.status === 'failed') {
        toast.error(`${label} failed to launch for ${d.key}`);
      } else if (d.status === 'launched') {
        toast.success(`${label} launched for ${d.key}`);
      }
    });
  }, []);
}
