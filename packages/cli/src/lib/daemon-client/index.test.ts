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

  it('includes the per-worktree appUrl in the POST body when provided (CREW-233)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 500 }));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn: vi.fn() });
    await client.registerRun({ ...validBody, appUrl: 'http://localhost:51234' });
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body.appUrl).toBe('http://localhost:51234');
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

describe('CrewDaemonClient.claimPendingAction', () => {
  const row = {
    id: 7,
    kind: 'run' as const,
    ticketKey: 'CREW-1',
    project: 'crew',
    payload: { kind: 'run' as const },
    status: 'claimed' as const,
    error: null,
    createdAt: '2026-06-04T00:00:00Z',
    updatedAt: '2026-06-04T00:00:01Z',
  };

  it('long-polls and returns the claimed action on 200', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(row), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.claimPendingAction(25_000);
    expect('action' in result).toBe(true);
    if ('action' in result) expect(result.action?.id).toBe(7);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/actions/pending?timeoutMs=25000',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns action:null when the long-poll times out with a null body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('null', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.claimPendingAction();
    expect('action' in result).toBe(true);
    if ('action' in result) expect(result.action).toBeNull();
  });

  it('returns ok:false on connection error without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const warn = vi.fn();
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn });
    const result = await client.claimPendingAction();
    expect('action' in result).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('CrewDaemonClient.reportActionResult', () => {
  it('POSTs the status+error and returns ok:true on 204', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.reportActionResult(7, 'failed', 'boom');
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/actions/7/result',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ status: 'failed', error: 'boom' }),
      }),
    );
  });

  it('omits error from the body when not provided', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    await client.reportActionResult(7, 'launched');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/actions/7/result',
      expect.objectContaining({ body: JSON.stringify({ status: 'launched' }) }),
    );
  });

  it('returns ok:false on connection error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const warn = vi.fn();
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn });
    const result = await client.reportActionResult(7, 'launching');
    expect(result.ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('CrewDaemonClient.reportFinishStep', () => {
  const step = { index: 2, label: 'git fetch --prune origin', status: 'ok' as const, ts: 1700 };

  it('POSTs the step body to /api/agents/:key/finish-step and returns ok on 201', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 201 }));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.reportFinishStep('KAN-1', step);
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/agents/KAN-1/finish-step',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(step) }),
    );
  });

  it('url-encodes the agent key in the path', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 201 }));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    await client.reportFinishStep('KAN 1/2', step);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/agents/KAN%201%2F2/finish-step',
      expect.anything(),
    );
  });

  it('returns ok:false on connection error without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const warn = vi.fn();
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn });
    const result = await client.reportFinishStep('KAN-1', step);
    expect(result.ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('CrewDaemonClient.heartbeat', () => {
  it('POSTs to /api/runner/heartbeat and returns the status on 200', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ online: true, lastSeen: 123 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.heartbeat();
    expect('online' in result).toBe(true);
    if ('online' in result) expect(result.online).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/runner/heartbeat',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns ok:false on connection error without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const warn = vi.fn();
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn });
    const result = await client.heartbeat();
    expect('online' in result).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('CrewDaemonClient.heartbeat with a snapshot (CREW-243)', () => {
  const snapshot = {
    processes: [
      {
        agentKey: 'CREW-231',
        command: 'run' as const,
        pid: 10,
        pgid: 10,
        actionRequestId: 1,
        spawnedAt: '2026-06-16T00:00:00.000Z',
        state: 'running' as const,
        project: 'crew',
      },
    ],
  };

  it('POSTs the snapshot in a { snapshot } body when one is supplied', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ online: true, lastSeen: 123, processes: snapshot.processes }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    await client.heartbeat(snapshot);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ snapshot });
  });

  it('sends no body when called without a snapshot (legacy edge-only ping)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ online: true, lastSeen: 1, processes: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    await client.heartbeat();
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
  });
});

describe('CrewDaemonClient.claimPendingCommand (CREW-243)', () => {
  const row = {
    id: 3,
    agentKey: 'CREW-231',
    kind: 'cancel_soft' as const,
    payload: null,
    status: 'claimed' as const,
    error: null,
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:01.000Z',
  };

  it('GETs /api/runner/commands/pending and returns the claimed command', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(row), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.claimPendingCommand();
    expect('command' in result).toBe(true);
    if ('command' in result) expect(result.command?.id).toBe(3);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/runner/commands/pending',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns command:null when the queue is empty (null body)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('null', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.claimPendingCommand();
    expect('command' in result).toBe(true);
    if ('command' in result) expect(result.command).toBeNull();
  });

  it('returns ok:false on connection error without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn: vi.fn() });
    const result = await client.claimPendingCommand();
    expect('command' in result).toBe(false);
  });
});

describe('CrewDaemonClient.reportCommandResult (CREW-243)', () => {
  it('POSTs the status+error to /api/runner/commands/:id/result on 204', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.reportCommandResult(3, 'failed', 'no tracked process');
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/runner/commands/3/result',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ status: 'failed', error: 'no tracked process' }),
      }),
    );
  });

  it('omits error from the body when not provided', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    await client.reportCommandResult(3, 'applied');
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ status: 'applied' });
  });

  it('returns ok:false on connection error without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn: vi.fn() });
    const result = await client.reportCommandResult(3, 'applied');
    expect(result.ok).toBe(false);
  });
});

describe('CrewDaemonClient.getRunnerStatus (CREW-243)', () => {
  it('GETs /api/runner/status and returns the live-process snapshot', async () => {
    const processes = [
      {
        agentKey: 'CREW-231',
        command: 'run' as const,
        pid: 10,
        pgid: 10,
        actionRequestId: 1,
        spawnedAt: '2026-06-16T00:00:00.000Z',
        state: 'running' as const,
        project: 'crew',
      },
    ];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ online: true, lastSeen: 99, processes }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.getRunnerStatus();
    expect('processes' in result).toBe(true);
    if ('processes' in result) {
      expect(result.online).toBe(true);
      expect(result.processes).toHaveLength(1);
    }
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/runner/status',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns ok:false on connection error without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn: vi.fn() });
    const result = await client.getRunnerStatus();
    expect('processes' in result).toBe(false);
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

const launchingInput = {
  key: 'KAN-9',
  projectName: 'demo',
  command: 'run' as const,
  worktreePath: '/x',
  branch: 'KAN-9',
  startedAt: '2026-06-17T12:00:00Z',
};

const failure = {
  check: 'git-remote',
  headline: 'No git remote configured',
  remediation: 'Add an origin remote and retry.',
  output: '✗ preflight: No git remote configured',
};

describe('CrewDaemonClient.reportLaunching', () => {
  it('POSTs to /api/runner/launching and returns the runId on 201', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ runId: 7 }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.reportLaunching(launchingInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.runId).toBe(7);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/runner/launching',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns ok:false on connection error without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn: vi.fn() });
    const result = await client.reportLaunching(launchingInput);
    expect(result.ok).toBe(false);
  });
});

describe('CrewDaemonClient.reportFailedStart', () => {
  it('POSTs the failure diagnosis to /api/runner/failed-start', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ runId: 8 }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.reportFailedStart({
      key: 'KAN-9',
      projectName: 'demo',
      command: 'run',
      failure,
    });
    expect(result.ok).toBe(true);
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body.failure).toEqual(failure);
  });

  it('returns ok:false on connection error without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773', warn: vi.fn() });
    const result = await client.reportFailedStart({
      key: 'KAN-9',
      projectName: 'demo',
      command: 'run',
      failure,
    });
    expect(result.ok).toBe(false);
  });
});

describe('CrewDaemonClient.acknowledgeRun', () => {
  it('POSTs to /api/runs/:key/acknowledge', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ acknowledged: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new CrewDaemonClient({ baseUrl: 'http://localhost:7773' });
    const result = await client.acknowledgeRun('KAN-9');
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7773/api/runs/KAN-9/acknowledge',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
