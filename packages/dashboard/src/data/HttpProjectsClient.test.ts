import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpProjectsClient } from './HttpProjectsClient.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HttpProjectsClient.listProjects', () => {
  it('GETs /api/projects and returns the projects array', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          projects: [{ name: 'demo', repoPath: '/code/demo' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const client = new HttpProjectsClient();
    const projects = await client.listProjects();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(projects).toEqual([{ name: 'demo', repoPath: '/code/demo' }]);
  });

  it('throws when the response shape does not match the schema', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ wrong: 'shape' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new HttpProjectsClient();
    await expect(client.listProjects()).rejects.toThrow();
  });

  it('throws on non-2xx status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }));
    const client = new HttpProjectsClient();
    await expect(client.listProjects()).rejects.toThrow(/500/);
  });
});
