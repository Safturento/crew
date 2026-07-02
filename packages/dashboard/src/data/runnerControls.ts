import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { RunnerCommand, RunnerCommandKind } from 'crew-shared';

import { defaultClient } from './queries.js';

/**
 * CREW-245: the runner control layer. Each hook enqueues a runner reverse-queue
 * command (or acknowledges a failed-start) and toasts the outcome. The actual
 * effect — signalling the tracked process group, settling an orphan, dropping a
 * pending action — happens host-side when the runner drains the command; the
 * row reconciles against the next snapshot. These are thin mutation wrappers so
 * the Agents-grid rows (CREW-311) and the supervisor drawer (CREW-312) share
 * one control path.
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

/**
 * Pause a running agent — SIGTERM its turn and keep the entry tracked as
 * `paused` (CREW-272). Non-destructive + resumable, so it enqueues immediately
 * (no confirm); the row/drawer reconciles to `paused` on the next snapshot.
 */
export function usePauseRun(): UseMutationResult<RunnerCommand, Error, string> {
  return useRunnerCommand('pause', 'pause');
}

/** The input to a resume: the agent key plus an optional steer message. */
export interface ResumeInput {
  agentKey: string;
  message?: string;
}

/**
 * Resume a paused agent. With no steer message it enqueues a plain `resume`;
 * with one it enqueues a `message` command carrying `payload.message` (the
 * resume-with-injected-message path). `resume` and `message` share one host
 * apply path (CREW-272) — the kind only varies whether a message rides along.
 */
export function useResumeRun(): UseMutationResult<RunnerCommand, Error, ResumeInput> {
  return useMutation<RunnerCommand, Error, ResumeInput>({
    mutationFn: ({ agentKey, message }) => {
      const steer = message?.trim();
      return steer
        ? defaultClient.enqueueRunnerCommand({
            agentKey,
            kind: 'message',
            payload: { message: steer },
          })
        : defaultClient.enqueueRunnerCommand({ agentKey, kind: 'resume', payload: null });
    },
    onError: (error, { agentKey }) => {
      toast.error(`Couldn't resume ${agentKey}: ${error.message}`);
    },
  });
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

/**
 * Enqueue a queue-level supervisor command (CREW-293). Unlike the per-process
 * controls above, `supervisor_stop` / `supervisor_restart` carry a null
 * `agentKey` — they target the supervisor process itself. The host worker
 * drains the command and exits (stop) or exits-and-respawns (restart); the
 * supervisor drawer reconciles to its new online/offline state on the next
 * heartbeat. Takes no input (void) since there's no agent to address.
 */
function useSupervisorCommand(
  kind: 'supervisor_stop' | 'supervisor_restart',
  verb: string,
): UseMutationResult<RunnerCommand, Error, void> {
  return useMutation<RunnerCommand, Error, void>({
    mutationFn: () => defaultClient.enqueueRunnerCommand({ agentKey: null, kind, payload: null }),
    onError: (error) => {
      toast.error(`Couldn't ${verb} the supervisor: ${error.message}`);
    },
  });
}

/** Gracefully stop the supervisor — it drains the command and exits cleanly. */
export function useStopSupervisor(): UseMutationResult<RunnerCommand, Error, void> {
  return useSupervisorCommand('supervisor_stop', 'stop');
}

/** Restart the supervisor — the worker exits non-zero and the self-respawn loop relaunches it. */
export function useRestartSupervisor(): UseMutationResult<RunnerCommand, Error, void> {
  return useSupervisorCommand('supervisor_restart', 'restart');
}

/**
 * Archive (acknowledge) a key's failed-start rows — moves them from the
 * Failed-to-start attention queue to Recently ended. The daemon acknowledges
 * synchronously but publishes no SSE edge for it (and failed-start rows carry
 * none), so we invalidate `['runner-page']` on success to refetch the wired
 * sections immediately rather than waiting on the 30s poll (CREW-291).
 */
export function useArchiveFailedStart(): UseMutationResult<number, Error, string> {
  const qc = useQueryClient();
  return useMutation<number, Error, string>({
    mutationFn: (key) => defaultClient.acknowledgeRun(key),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['runner-page'] });
    },
    onError: (error, key) => {
      toast.error(`Couldn't archive ${key}: ${error.message}`);
    },
  });
}
