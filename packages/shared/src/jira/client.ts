export interface JiraClientOptions {
  site: string;
  email: string;
  token: string;
}

export interface JiraIssue {
  key: string;
  fields: {
    status: { name: string };
    issuetype?: { name: string };
    parent?: { key: string };
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
