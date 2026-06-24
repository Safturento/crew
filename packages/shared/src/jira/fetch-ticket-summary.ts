import { JiraClient } from './client.js';

export interface FetchTicketSummaryOptions {
  key: string;
  jiraSite: string;
  email: string;
  token: string;
  warn?: (msg: string) => void;
  // Test seam — defaults to `new JiraClient(...)`.
  clientFactory?: (opts: { site: string; email: string; token: string }) => Pick<JiraClient, 'getIssue'>;
}

/**
 * Fetch the Jira ticket summary for `key`. Returns `''` on any failure mode
 * (network error, 404, malformed response). Never throws.
 *
 * The empty-string contract matches the daemon's `registerRun` upsert:
 * `ticket_title: body.ticketTitle === '' ? null : body.ticketTitle` plus
 * `COALESCE(NULLIF(excluded.ticket_title, ''), agents.ticket_title)` on
 * conflict. So an empty return preserves any title already on the agent
 * row rather than clobbering it.
 */
export async function fetchTicketSummary(opts: FetchTicketSummaryOptions): Promise<string> {
  const factory =
    opts.clientFactory ??
    ((o) => new JiraClient(o));
  try {
    const client = factory({ site: opts.jiraSite, email: opts.email, token: opts.token });
    const issue = await client.getIssue(opts.key);
    const summary = (issue.fields as { summary?: unknown }).summary;
    return typeof summary === 'string' ? summary : '';
  } catch (err) {
    opts.warn?.(`fetch Jira title for ${opts.key}: ${(err as Error).message}`);
    return '';
  }
}

/**
 * Convenience wrapper around {@link fetchTicketSummary} that reads
 * `CREW_JIRA_EMAIL` + `CREW_JIRA_API_TOKEN` from the given env. Returns
 * `''` when either credential is missing — no Jira call attempted.
 */
export async function fetchTicketSummaryFromEnv(
  key: string,
  jiraSite: string,
  env: NodeJS.ProcessEnv,
  warn?: (msg: string) => void,
): Promise<string> {
  const email = env.CREW_JIRA_EMAIL?.trim();
  const token = env.CREW_JIRA_API_TOKEN?.trim();
  if (!email || !token) return '';
  return fetchTicketSummary({ key, jiraSite, email, token, warn });
}
