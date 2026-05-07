import { render } from './render.js';

export interface BuildRebasePreambleOptions {
  key: string;
  baseBranch: string;
}

/**
 * The rebase-first preamble that fix-pr (and any future caller that resumes
 * an in-flight branch) prepends to its agent prompt. The agent runs
 * `git fetch origin <base> && git rebase origin/<base>` as Step 0; the
 * preamble carries the conflict-resolution rules and the recovery escape
 * hatch for a wedged docker stack. Idempotent in the no-conflict case.
 */
export function buildRebasePreamble(opts: BuildRebasePreambleOptions): string {
  return render('rebase-preamble', {
    key: opts.key,
    baseBranch: opts.baseBranch,
  });
}
