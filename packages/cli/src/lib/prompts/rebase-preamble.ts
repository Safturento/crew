import { render } from './render.js';

export interface BuildRebasePreambleOptions {
  key: string;
  baseBranch: string;
  playwrightEnabled?: boolean;
}

/**
 * The rebase-first preamble that fix-pr (and any future caller that resumes
 * an in-flight branch) prepends to its agent prompt. The agent runs
 * `git fetch origin <base> && git rebase origin/<base>` as Step 0, then
 * `docker compose up --build --wait` as Step 0.5. Idempotent in the
 * no-conflict, stack-already-up case.
 */
export function buildRebasePreamble(opts: BuildRebasePreambleOptions): string {
  const playwrightInstall = opts.playwrightEnabled ? '\nnpx playwright install chromium' : '';
  return render('rebase-preamble', {
    key: opts.key,
    baseBranch: opts.baseBranch,
    playwrightInstall,
  });
}
