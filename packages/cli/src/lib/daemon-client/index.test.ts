import { describe, it, expect, vi, afterEach } from 'vitest';
import { CrewDaemonClient } from './index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const validBody = {
  key: 'KAN-1',
  projectName: 'demo',
  ticketTitle: 'Demo title',
  worktreePath: '/x',
  branch: 'KAN-1',
  sessionId: 's1',
  command: 'run' as const,
  startedAt: '2026-04-29T12:00:00Z',
};

describe('CrewDaemonClient.registerRun', () => {
  it('POSTs the body and returns the response on 201', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          agent: { ...validBody },
          run: {
            id: 42,
            agentKey: 'KAN-1',
            command: 'run',
            sessionId: 's1',
            startedAt: validBody.startedAt,
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.registerRun(validBody);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.run.id).toBe(42);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/agents/runs',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns ok:false on connection error without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const warn = vi.fn();
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn });
    const result = await client.registerRun(validBody);
    expect(result.ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('returns ok:false on non-2xx without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }));
    const warn = vi.fn();
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn });
    const result = await client.registerRun(validBody);
    expect(result.ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('CrewDaemonClient.completeRun', () => {
  it('POSTs and returns ok:true on 204', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.completeRun(42, {
      exitCode: 0,
      completedAt: '2026-04-29T13:00:00Z',
    });
    expect(result.ok).toBe(true);
  });

  it('returns ok:false on connection error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const warn = vi.fn();
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn });
    const result = await client.completeRun(42, {
      exitCode: 0,
      completedAt: '2026-04-29T13:00:00Z',
    });
    expect(result.ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('crewDaemonClientFromEnv', () => {
  it('uses CREW_PORT when set', async () => {
    const { crewDaemonClientFromEnv } = await import('./index.js');
    const client = crewDaemonClientFromEnv({ CREW_PORT: '7799' });
    expect(client.baseUrl).toBe('http://localhost:7799');
  });

  it('defaults to 7773 when CREW_PORT is unset', async () => {
    const { crewDaemonClientFromEnv } = await import('./index.js');
    const client = crewDaemonClientFromEnv({});
    expect(client.baseUrl).toBe('http://localhost:7773');
  });
});
