import { execa } from 'execa';

export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

interface GhResponse {
  state: 'OPEN' | 'CLOSED' | 'MERGED';
}

/**
 * Query the GitHub PR's current state via `gh pr view`. The `gh` CLI's
 * `state` field is one of OPEN / CLOSED / MERGED — a single field is
 * sufficient. (Earlier spec drafts referenced a `merged` boolean; that
 * field does not exist in `gh pr view --json`. Available fields include
 * `mergedAt`, `mergedBy`, etc., but `state` already carries the answer.)
 *
 * Throws on any `gh` failure (binary missing, auth, network, malformed
 * JSON). PrPoller wraps the call and turns the failure into a per-agent
 * warn log + no-op so one broken agent never aborts the wider poll round.
 */
export async function fetchPrStateViaGh(prUrl: string): Promise<PrState> {
  const { stdout } = await execa('gh', ['pr', 'view', prUrl, '--json', 'state']);
  const parsed = JSON.parse(stdout) as GhResponse;
  return parsed.state;
}
