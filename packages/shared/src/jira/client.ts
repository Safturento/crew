export interface JiraClientOptions {
  site: string;
  email: string;
  token: string;
}

export interface JiraLinkedIssue {
  key: string;
  fields: {
    summary?: string;
    status?: { name: string; statusCategory?: { key: string; name?: string } };
  };
}

export interface JiraIssueLink {
  type: { name: string; inward: string; outward: string };
  inwardIssue?: JiraLinkedIssue;
  outwardIssue?: JiraLinkedIssue;
}

export interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    status: { name: string; statusCategory?: { key: string; name?: string } };
    issuetype?: { name: string };
    priority?: { name: string } | null;
    parent?: { key: string; fields?: { summary?: string } };
    issuelinks?: JiraIssueLink[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

export class JiraClient {
  private readonly authHeader: string;
  private readonly site: string;

  constructor(opts: JiraClientOptions) {
    this.site = opts.site;
    this.authHeader = `Basic ${Buffer.from(`${opts.email}:${opts.token}`).toString('base64')}`;
  }

  async getIssue(key: string): Promise<JiraIssue> {
    return this.request<JiraIssue>(`/rest/api/3/issue/${key}`);
  }

  async getTransitions(key: string): Promise<JiraTransition[]> {
    const body = await this.request<{ transitions: JiraTransition[] }>(
      `/rest/api/3/issue/${key}/transitions`,
    );
    return body.transitions;
  }

  async transition(key: string, transitionId: string): Promise<void> {
    await this.request(`/rest/api/3/issue/${key}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
  }

  /**
   * JQL search via the v3 `/search/jql` endpoint. Single page of up to 100
   * issues — the picker's Ready-for-Development list is small, so pagination
   * is intentionally omitted (YAGNI). `fields` is the comma-joined field list
   * to hydrate (e.g. `['summary','status','parent','priority','issuelinks']`).
   */
  async searchIssues(jql: string, fields: string[]): Promise<JiraIssue[]> {
    const params = new URLSearchParams({ jql, fields: fields.join(','), maxResults: '100' });
    const body = await this.request<{ issues?: JiraIssue[] }>(
      `/rest/api/3/search/jql?${params.toString()}`,
    );
    return body.issues ?? [];
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.site}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = (await res.text()).trim();
      const detail = body ? ` — ${body}` : '';
      throw new Error(`Jira ${init?.method ?? 'GET'} ${path} failed: ${res.status}${detail}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
