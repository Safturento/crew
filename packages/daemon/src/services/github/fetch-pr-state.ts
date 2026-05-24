import { execa } from 'execa';

export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

interface GhResponse {
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  merged: boolean;
}

/**
 * Query the GitHub PR's current state via `gh pr view`. Normalizes the
 * response so callers don't have to think about gh's two-field shape:
 * MERGED whenever `merged: true` (regardless of `state`), CLOSED when
 * `state=CLOSED` and not merged, OPEN otherwise.
 *
 * Throws on any `gh` failure (binary missing, auth, network, malformed
 * JSON). PrPoller wraps the call and turns the failure into a per-agent
 * warn log + no-op so one broken agent never aborts the wider poll round.
 */
export async function fetchPrStateViaGh(prUrl: string): Promise<PrState> {
  const { stdout } = await execa('gh', ['pr', 'view', prUrl, '--json', 'state,merged']);
  const parsed = JSON.parse(stdout) as GhResponse;
  if (parsed.merged) return 'MERGED';
  if (parsed.state === 'CLOSED') return 'CLOSED';
  return 'OPEN';
}
