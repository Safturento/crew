import type { StateEventKind } from 'crew-shared';
import type { TransitionTarget } from './state-derivation.js';

/**
 * Pure, total reduction of a concrete lifecycle event against the agent's
 * current state. Returns the next state, or `null` when the event implies no
 * change (the daemon then writes nothing). `finished` and `pr_merged` are
 * terminal — only their dedicated paths (`crew finish`, `PrPoller`) move out.
 *
 * Operates over `TransitionTarget` (not the narrower `TransitionState`) because
 * `run_exited` can produce `idle`, which lives in the wider union — the
 * `state_transitions` CHECK + column types already permit it (migration 0002).
 *
 * `run_exited` is the only state-dependent case: a run process ending while
 * still `running` means it produced no PR → `idle` (the operator decides next);
 * ending while already `pr_open` is the normal happy path → no change.
 *
 * A non-zero `exitCode` on either `*_exited` event supersedes the normal
 * routing → `error`: a dispatch that crashed didn't go idle or back to pr_open,
 * it failed. `exitCode` is meaningful only on `*_exited`; an omitted/`null`
 * (clean) code keeps the normal routing. `recordError` still owns the
 * *startup-phase* failure path — this covers the runner's own non-zero exit.
 *
 * `run_paused` (CREW-273) is the pause-interrupt variant of `run_exited`: like
 * `run_exited` it settles a `running` run, but to `idle` (non-terminal,
 * resumable) and **without** the error branch — a pause SIGTERMs the runner
 * (exit 130) yet must never mark the run `error`. The user-visible `paused`
 * label lives in the runner's live-process snapshot, not this run-state.
 */
export function reduceState(
  current: TransitionTarget,
  event: StateEventKind,
  exitCode?: number | null,
): TransitionTarget | null {
  if (current === 'finished' || current === 'pr_merged') return null;

  if ((event === 'run_exited' || event === 'fixpr_exited') && exitCode != null && exitCode !== 0) {
    return current === 'error' ? null : 'error';
  }

  let next: TransitionTarget | null;
  switch (event) {
    case 'run_started':
      next = 'running';
      break;
    case 'pr_created':
      next = 'pr_open';
      break;
    case 'fixpr_started':
      next = current === 'pr_open' ? 'running' : null;
      break;
    case 'fixpr_exited':
      next = 'pr_open';
      break;
    case 'run_exited':
      next = current === 'running' ? 'idle' : null;
      break;
    case 'run_paused':
      // CREW-273: a pause-interrupt stays non-terminal + resumable. A run
      // paused while `running` settles to `idle` (operator decides next);
      // the live-process `paused` label is carried by the runner's in-memory
      // snapshot, not the persistent run-state. Exempt from the
      // non-zero-exit → error branch above (it never carries an error code).
      next = current === 'running' ? 'idle' : null;
      break;
    case 'finish_completed':
      next = 'finished';
      break;
    default: {
      const _exhaustive: never = event;
      next = _exhaustive;
    }
  }
  return next === current ? null : next;
}
