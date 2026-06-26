import { createHmac } from 'node:crypto';

/**
 * Minimal but realistic GitHub `pull_request` delivery (closed/merged). The
 * webhook service keys off `action`, `pull_request.html_url`, and
 * `repository.full_name`; everything else GitHub sends is irrelevant to the
 * merge-detection path, so the fixture stays small on purpose.
 */
export function pullRequestClosedPayload(
  opts: { repo?: string; htmlUrl?: string; action?: string } = {},
): Record<string, unknown> {
  const repo = opts.repo ?? 'Owner/repo';
  return {
    action: opts.action ?? 'closed',
    pull_request: {
      html_url: opts.htmlUrl ?? `https://github.com/${repo}/pull/1`,
      merged: true,
      state: 'closed',
    },
    repository: { full_name: repo },
  };
}

/** The `ping` GitHub sends once on webhook creation. */
export function pingPayload(opts: { repo?: string } = {}): Record<string, unknown> {
  const repo = opts.repo ?? 'Owner/repo';
  return { zen: 'Keep it logically awesome.', hook_id: 1, repository: { full_name: repo } };
}

/** GitHub's X-Hub-Signature-256 over the exact bytes, with the given secret. */
export function signPayload(rawBody: string | Buffer, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
}
