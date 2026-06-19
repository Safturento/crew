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
 */
export function reduceState(
  current: TransitionTarget,
  event: StateEventKind,
): TransitionTarget | null {
  if (current === 'finished' || current === 'pr_merged') return null;

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
