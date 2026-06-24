import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from './client.js';

afterEach(() => vi.restoreAllMocks());

function mockFetchOnce(json: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('JiraClient.searchIssues', () => {
  it('builds /search/jql with jql + fields + maxResults and returns issues', async () => {
    const spy = mockFetchOnce({
      issues: [
        { key: 'CREW-1', fields: { summary: 'A', status: { name: 'Ready for Development' } } },
      ],
    });
    const client = new JiraClient({ site: 'https://x.atlassian.net', email: 'e@x', token: 't' });

    const issues = await client.searchIssues('project = "CREW"', ['summary', 'status']);

    expect(issues).toHaveLength(1);
    expect(issues[0].key).toBe('CREW-1');
    const url = new URL(spy.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/rest/api/3/search/jql');
    expect(url.searchParams.get('jql')).toBe('project = "CREW"');
    expect(url.searchParams.get('fields')).toBe('summary,status');
    expect(url.searchParams.get('maxResults')).toBe('100');
  });

  it('returns [] when Jira responds with no issues array', async () => {
    mockFetchOnce({});
    const client = new JiraClient({ site: 'https://x.atlassian.net', email: 'e@x', token: 't' });
    expect(await client.searchIssues('project = "CREW"', ['summary'])).toEqual([]);
  });
});
