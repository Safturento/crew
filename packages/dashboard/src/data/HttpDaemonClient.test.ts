import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentNotFoundError, HttpDaemonClient, ProjectNotFoundError } from './HttpDaemonClient.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HttpDaemonClient.listProjects', () => {
  it('GETs /api/projects and returns the array', async () => {
    const project = {
      name: 'demo',
      repoPath: '/x',
      branch: 'main',
      jiraKey: 'DEMO',
      activeCount: 2,
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ projects: [project] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new HttpDaemonClient();
    expect(await client.listProjects()).toEqual([project]);
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

const SAMPLE_PROJECT_DETAIL = {
  project: {
    name: 'kanban-api',
    repo_path: '/repos/kanban-api',
    default_branch: 'main',
    jira: { project_key: 'KAN', site: 'https://example.atlassian.net' },
    github: { repo: 'example/kanban-api' },
  },
  configPath: '/etc/crew/projects/kanban-api.toml',
};

describe('HttpDaemonClient.getProject', () => {
  it('GETs /api/projects/:slug and returns the parsed detail', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_PROJECT_DETAIL), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const detail = await new HttpDaemonClient().getProject('kanban-api');

    expect(detail.project.name).toBe('kanban-api');
    expect(detail.project.jira.project_key).toBe('KAN');
    expect(detail.configPath).toMatch(/kanban-api\.toml$/);
    expect(fetchSpy).toHaveBeenCalledWith('/api/projects/kanban-api');
  });

  it('encodes the slug when constructing the URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...SAMPLE_PROJECT_DETAIL,
          project: { ...SAMPLE_PROJECT_DETAIL.project, name: 'foo/bar' },
        }),
        {
          status: 200,
        },
      ),
    );

    await new HttpDaemonClient().getProject('foo/bar');

    expect(fetchSpy).toHaveBeenCalledWith('/api/projects/foo%2Fbar');
  });

  it('throws ProjectNotFoundError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(new HttpDaemonClient().getProject('gone')).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it('throws on other non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(new HttpDaemonClient().getProject('kanban-api')).rejects.toThrow(/500/);
  });

  it('throws on schema mismatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ project: { name: 'x' } }), { status: 200 }),
    );
    await expect(new HttpDaemonClient().getProject('x')).rejects.toThrow();
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

const SAMPLE_AGENT_DETAIL = {
  key: 'KAN-1',
  project: 'kanban-api',
  ticket_key: 'KAN-1',
  ticket_title: 'Build the agents list',
  state: 'running',
  worktree_path: '/repos/kanban-api-KAN-1',
  pr_url: null,
  app_url: null,
  jira_url: null,
  tokens_by_tool: [],
  model: '',
  runs: [
    {
      id: '1',
      command: 'run',
      started_at: '2026-04-29T12:00:00Z',
      completed_at: null,
      doc_load_coverage_pct: null,
      cleanliness_pass: null,
      pr_claim_input_tokens: null,
      parity_violations: null,
    },
  ],
  tokens: {
    total: 1234,
    input: 1000,
    output: 200,
    cache_read: 30,
    cache_creation: 4,
  },
  tool_call_count: 7,
};

describe('HttpDaemonClient.getAgent', () => {
  it('GETs /api/agents/:key and returns the parsed AgentDetail', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_AGENT_DETAIL), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const detail = await new HttpDaemonClient().getAgent('KAN-1');

    expect(detail).toMatchObject({
      key: 'KAN-1',
      project: 'kanban-api',
      state: 'running',
      tool_call_count: 7,
    });
    expect(detail.tokens.total).toBe(1234);
    expect(detail.runs[0]?.command).toBe('run');
    expect(fetchSpy).toHaveBeenCalledWith('/api/agents/KAN-1');
  });

  it('encodes the key when constructing the URL', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ...SAMPLE_AGENT_DETAIL, key: 'KAN/1' }), { status: 200 }),
      );

    await new HttpDaemonClient().getAgent('KAN/1');

    expect(fetchSpy).toHaveBeenCalledWith('/api/agents/KAN%2F1');
  });

  it('throws AgentNotFoundError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }));
    const client = new HttpDaemonClient();
    await expect(client.getAgent('GONE-1')).rejects.toBeInstanceOf(AgentNotFoundError);
  });

  it('throws on other non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(new HttpDaemonClient().getAgent('KAN-1')).rejects.toThrow(/500/);
  });

  it('throws on schema mismatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ key: 'KAN-1' /* missing fields */ }), { status: 200 }),
    );
    await expect(new HttpDaemonClient().getAgent('KAN-1')).rejects.toThrow();
  });
});

describe('HttpDaemonClient.getStateHistory', () => {
  it('GETs /api/agents/:key/state-history and returns the transitions', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          transitions: [
            { from: null, to: 'init', ts: 1000 },
            { from: 'init', to: 'running', ts: 1500 },
          ],
        }),
        { status: 200 },
      ),
    );

    const out = await new HttpDaemonClient().getStateHistory('KAN-1');

    expect(out.transitions).toHaveLength(2);
    expect(out.transitions[0]).toEqual({ from: null, to: 'init', ts: 1000 });
    expect(fetchSpy).toHaveBeenCalledWith('/api/agents/KAN-1/state-history');
  });

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(new HttpDaemonClient().getStateHistory('KAN-1')).rejects.toThrow(/500/);
  });

  it('throws on schema mismatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ transitions: [{ from: null }] }), { status: 200 }),
    );
    await expect(new HttpDaemonClient().getStateHistory('KAN-1')).rejects.toThrow();
  });
});

describe('HttpDaemonClient.getTimeline', () => {
  it('GETs /api/agents/:key/timeline and returns events without warnings by default', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          events: [{ type: 'assistant', uuid: 'u1', sessionId: 's1', ts: '2026-04-29T12:00:00Z' }],
        }),
        { status: 200 },
      ),
    );

    const out = await new HttpDaemonClient().getTimeline('KAN-1');

    expect(out.events).toHaveLength(1);
    expect(out.warnings).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledWith('/api/agents/KAN-1/timeline');
  });

  it('surfaces the X-Crew-Warning header as a warnings array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { 'X-Crew-Warning': 'transcript-missing' },
      }),
    );

    const out = await new HttpDaemonClient().getTimeline('KAN-1');

    expect(out.events).toEqual([]);
    expect(out.warnings).toEqual(['transcript-missing']);
  });

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(new HttpDaemonClient().getTimeline('KAN-1')).rejects.toThrow(/500/);
  });
});

describe('HttpDaemonClient.getFinishSteps (CREW-220)', () => {
  it('GETs /api/agents/:key/finish-steps and returns the ordered steps', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          steps: [
            { key: 'KAN-1', index: 0, label: 'git branch -D KAN-1', status: 'ok', detail: null, ts: 1000 },
            { key: 'KAN-1', index: 1, label: 'jira KAN-1 → Done', status: 'skip', detail: 'already Done', ts: 1100 },
          ],
        }),
        { status: 200 },
      ),
    );

    const steps = await new HttpDaemonClient().getFinishSteps('KAN-1');

    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual({
      key: 'KAN-1',
      index: 0,
      label: 'git branch -D KAN-1',
      status: 'ok',
      detail: null,
      ts: 1000,
    });
    expect(steps[1]?.status).toBe('skip');
    expect(fetchSpy).toHaveBeenCalledWith('/api/agents/KAN-1/finish-steps');
  });

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(new HttpDaemonClient().getFinishSteps('KAN-1')).rejects.toThrow(/500/);
  });

  it('throws on schema mismatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ steps: [{ index: 0 }] }), { status: 200 }),
    );
    await expect(new HttpDaemonClient().getFinishSteps('KAN-1')).rejects.toThrow();
  });
});

describe('HttpDaemonClient.refreshPrStatus (CREW-202)', () => {
  it('POSTs to /api/agents/:key/refresh-pr-status and parses the response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ stateChanged: true, newState: 'pr_merged' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await new HttpDaemonClient().refreshPrStatus('KAN-1');

    expect(result).toEqual({ stateChanged: true, newState: 'pr_merged' });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/agents/KAN-1/refresh-pr-status',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('handles the no-op shape (stateChanged: false, no newState)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ stateChanged: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await new HttpDaemonClient().refreshPrStatus('KAN-2');
    expect(result.stateChanged).toBe(false);
    expect(result.newState).toBeUndefined();
  });

  it('encodes the key into the URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ stateChanged: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await new HttpDaemonClient().refreshPrStatus('weird/key');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/agents/weird%2Fkey/refresh-pr-status',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws AgentNotFoundError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(new HttpDaemonClient().refreshPrStatus('NOPE')).rejects.toBeInstanceOf(
      AgentNotFoundError,
    );
  });

  it('throws on other non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(new HttpDaemonClient().refreshPrStatus('K')).rejects.toThrow(/500/);
  });
});

const SAMPLE_ACTION = {
  id: 7,
  kind: 'run',
  ticketKey: 'CREW-1',
  project: 'crew',
  payload: { kind: 'run' },
  status: 'pending',
  error: null,
  createdAt: '2026-06-04T00:00:00Z',
  updatedAt: '2026-06-04T00:00:00Z',
};

describe('HttpDaemonClient.enqueueAction (CREW-217)', () => {
  it('POSTs the action to /api/actions and returns the parsed ActionRequest', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_ACTION), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const action = await new HttpDaemonClient().enqueueAction({
      kind: 'run',
      project: 'crew',
      ticketKey: 'CREW-1',
    });

    expect(action).toMatchObject({ id: 7, kind: 'run', status: 'pending' });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ kind: 'run', project: 'crew', ticketKey: 'CREW-1' }),
      }),
    );
  });

  it('carries a fix_pr comment through to the body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...SAMPLE_ACTION,
          kind: 'fix_pr',
          payload: { kind: 'fix_pr', comment: 'fix it' },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );

    await new HttpDaemonClient().enqueueAction({
      kind: 'fix_pr',
      project: 'crew',
      ticketKey: 'CREW-1',
      comment: 'fix it',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/actions',
      expect.objectContaining({
        body: JSON.stringify({
          kind: 'fix_pr',
          project: 'crew',
          ticketKey: 'CREW-1',
          comment: 'fix it',
        }),
      }),
    );
  });

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad', { status: 400 }));
    await expect(
      new HttpDaemonClient().enqueueAction({ kind: 'run', project: 'crew', ticketKey: 'CREW-1' }),
    ).rejects.toThrow(/400/);
  });

  it('throws on schema mismatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'not-a-number' }), { status: 201 }),
    );
    await expect(
      new HttpDaemonClient().enqueueAction({ kind: 'run', project: 'crew', ticketKey: 'CREW-1' }),
    ).rejects.toThrow();
  });
});

describe('HttpDaemonClient.getRunnerStatus (CREW-217)', () => {
  it('GETs /api/runner/status and returns the parsed status', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ online: true, lastSeen: 1717459200000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const status = await new HttpDaemonClient().getRunnerStatus();

    expect(status).toEqual({ online: true, lastSeen: 1717459200000 });
    expect(fetchSpy).toHaveBeenCalledWith('/api/runner/status');
  });

  it('accepts a null lastSeen (no heartbeat yet)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ online: false, lastSeen: null }), { status: 200 }),
    );

    const status = await new HttpDaemonClient().getRunnerStatus();
    expect(status).toEqual({ online: false, lastSeen: null });
  });

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(new HttpDaemonClient().getRunnerStatus()).rejects.toThrow(/500/);
  });
});
