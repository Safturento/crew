import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpDaemonClient } from './HttpDaemonClient.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HttpDaemonClient.listProjects', () => {
  it('GETs /api/projects and returns the array', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ projects: [{ name: 'demo', repoPath: '/x' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new HttpDaemonClient();
    expect(await client.listProjects()).toEqual([{ name: 'demo', repoPath: '/x' }]);
    expect(fetchSpy).toHaveBeenCalledWith('/api/projects');
  });

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }));
    await expect(new HttpDaemonClient().listProjects()).rejects.toThrow(/500/);
  });

  it('throws on schema mismatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ wrong: 'shape' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(new HttpDaemonClient().listProjects()).rejects.toThrow();
  });
});

describe('HttpDaemonClient.listAgents', () => {
  it('GETs /api/agents and returns the array', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          agents: [
            {
              key: 'KAN-1',
              projectName: 'demo',
              ticketTitle: 'Demo',
              state: 'running',
              startedAt: '2026-04-29T12:00:00Z',
              tokens: 42,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const agents = await new HttpDaemonClient().listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ key: 'KAN-1', state: 'running', tokens: 42 });
    expect(fetchSpy).toHaveBeenCalledWith('/api/agents');
  });

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }));
    await expect(new HttpDaemonClient().listAgents()).rejects.toThrow(/500/);
  });

  it('throws on schema mismatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ agents: [{ key: 'KAN-1' /* missing fields */ }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(new HttpDaemonClient().listAgents()).rejects.toThrow();
  });
});
