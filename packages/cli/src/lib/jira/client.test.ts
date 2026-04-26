import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraClient } from './index.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const client = new JiraClient({
  site: 'https://safturento.atlassian.net',
  email: 'me@example.com',
  token: 'xxx',
});

beforeEach(() => fetchMock.mockReset());

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function status(code: number) {
  return {
    ok: false,
    status: code,
    json: async () => ({}),
    text: async () => '',
  };
}

describe('JiraClient.getIssue', () => {
  it('GETs the issue endpoint with Basic auth', async () => {
    fetchMock.mockResolvedValueOnce(ok({ key: 'KAN-1', fields: { status: { name: 'Done' } } }));

    const issue = await client.getIssue('KAN-1');

    expect(issue.key).toBe('KAN-1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://safturento.atlassian.net/rest/api/3/issue/KAN-1');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: expect.stringMatching(/^Basic /) as unknown as string,
    });
  });

  it('throws a useful error on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(status(404));
    await expect(client.getIssue('NOPE-1')).rejects.toThrow(/404/);
  });
});

describe('JiraClient.getTransitions', () => {
  it('returns the transitions array', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ transitions: [{ id: '11', name: 'Done', to: { name: 'Done' } }] }),
    );

    const transitions = await client.getTransitions('KAN-1');

    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.name).toBe('Done');
  });
});

describe('JiraClient.transition', () => {
  it('POSTs the transition body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => ({}),
      text: async () => '',
    });

    await client.transition('KAN-1', '11');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://safturento.atlassian.net/rest/api/3/issue/KAN-1/transitions');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      transition: { id: '11' },
    });
  });
});
