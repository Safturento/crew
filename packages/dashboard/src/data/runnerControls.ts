import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { RunnerCommand, RunnerCommandKind } from 'crew-shared';

import { defaultClient } from './queries.js';

/**
 * CREW-245: the Runner page control layer. Each hook enqueues a runner
 * reverse-queue command (or acknowledges a failed-start) and toasts the
 * outcome. The actual effect — signalling the tracked process group, settling
 * an orphan, dropping a pending action — happens host-side when the runner
 * drains the command; the row reconciles against the next snapshot. These are
 * thin mutation wrappers so the Runner page rows and (CREW-246) the drawer
 * header share one control path.
 */

function useRunnerCommand(
  kind: RunnerCommandKind,
  verb: string,
): UseMutationResult<RunnerCommand, Error, string> {
  return useMutation<RunnerCommand, Error, string>({
    mutationFn: (agentKey) => defaultClient.enqueueRunnerCommand({ agentKey, kind, payload: null }),
    onError: (error, agentKey) => {
      toast.error(`Couldn't ${verb} ${agentKey}: ${error.message}`);
    },
  });
}

/** Soft cancel — SIGTERM the tracked process group (graceful). */
export function useCancelRun(): UseMutationResult<RunnerCommand, Error, string> {
  return useRunnerCommand('cancel_soft', 'cancel');
}

/** Hard cancel — SIGKILL the tracked process group (the escalation). */
export function useForceKill(): UseMutationResult<RunnerCommand, Error, string> {
  return useRunnerCommand('cancel_hard', 'force-kill');
}

/** Force-settle an orphaned run (running in the DB, no live process). */
export function useReap(): UseMutationResult<RunnerCommand, Error, string> {
  return useRunnerCommand('reap', 'reap');
}

/** Drop a still-pending action request before the runner spawns it. */
export function useDequeue(): UseMutationResult<RunnerCommand, Error, string> {
  return useRunnerCommand('dequeue', 'dequeue');
}

/** Archive (acknowledge) a key's failed-start rows — moves them to Recently ended. */
export function useArchiveFailedStart(): UseMutationResult<number, Error, string> {
  return useMutation<number, Error, string>({
    mutationFn: (key) => defaultClient.acknowledgeRun(key),
    onError: (error, key) => {
      toast.error(`Couldn't archive ${key}: ${error.message}`);
    },
  });
}
