import type { Octokit } from '@octokit/rest';

export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

/** Parse `https://github.com/<owner>/<repo>/pull/<n>` → its parts. */
export function parsePrUrl(url: string): { owner: string; repo: string; number: number } {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) throw new Error(`unparseable PR URL: ${url}`);
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/**
 * Typed GitHub client for the daemon. Wraps Octokit so PrPoller no longer
 * shells out to `gh pr view` (CREW-301). Replaces fetch-pr-state.ts; returns
 * the identical PrState the poller consumed before.
 */
export class GithubClient {
  constructor(private readonly octokit: Octokit) {}

  async fetchPrState(prUrl: string): Promise<PrState> {
    const { owner, repo, number } = parsePrUrl(prUrl);
    const { data } = await this.octokit.pulls.get({ owner, repo, pull_number: number });
    if (data.merged) return 'MERGED';
    return data.state === 'closed' ? 'CLOSED' : 'OPEN';
  }
}
