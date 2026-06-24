import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { eventStream } from './eventStream.js';
import {
  defaultClient,
  useAgent,
  useProject,
  useRefreshPrStatus,
  useStateHistory,
  useTimeline,
} from './queries.js';
import type {
  AgentDetail,
  ProjectDetailResponse,
  StateTransition,
  TranscriptEvent,
} from './types.js';

type Handler = (data: unknown) => void;

const SAMPLE_DETAIL: AgentDetail = {
  key: 'KAN-1',
  project: 'kanban-api',
  ticket_key: 'KAN-1',
  ticket_title: 'Sample',
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
  tokens: { total: 0, input: 0, output: 0, cache_read: 0, cache_creation: 0 },
  tool_call_count: 0,
};

const SAMPLE_HISTORY: { transitions: StateTransition[] } = {
  transitions: [{ from: null, to: 'init', ts: 1000 }],
};

const SAMPLE_TIMELINE: { events: TranscriptEvent[]; warnings?: string[] } = {
  events: [],
};

const SAMPLE_PROJECT_DETAIL: ProjectDetailResponse = {
  project: {
    name: 'kanban-api',
    repo_path: '~/code/kanban-api',
    default_branch: 'main',
    jira: {
      project_key: 'KAN',
      site: 'https://example.atlassian.net',
      ready_status: 'Ready for Development',
    },
    github: { repo: 'example/kanban-api' },
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    },
  },
  configPath: '~/.config/crew/projects/kanban-api.toml',
};

let handlers: Map<string, Set<Handler>>;
let qc: QueryClient;

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  handlers = new Map();
  vi.spyOn(eventStream, 'on').mockImplementation((event, fn) => {
    let bucket = handlers.get(event);
    if (!bucket) {
      bucket = new Set();
      handlers.set(event, bucket);
    }
    bucket.add(fn);
    return () => {
      bucket!.delete(fn);
    };
  });

  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.restoreAllMocks();
  qc.clear();
});

function fire(event: string, data: unknown): void {
  const bucket = handlers.get(event);
  if (!bucket) return;
  for (const fn of bucket) fn(data);
}

describe('useAgent', () => {
  it('queries with key [agent, key] via defaultClient.getAgent', async () => {
    const spy = vi.spyOn(defaultClient, 'getAgent').mockResolvedValue(SAMPLE_DETAIL);

    const { result } = renderHook(() => useAgent('KAN-1'), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith('KAN-1');
    expect(result.current.data).toEqual(SAMPLE_DETAIL);
    expect(qc.getQueryData(['agent', 'KAN-1'])).toEqual(SAMPLE_DETAIL);
  });

  it('patches the cached AgentDetail.state when agent.state_changed fires for the same key', async () => {
    vi.spyOn(defaultClient, 'getAgent').mockResolvedValue(SAMPLE_DETAIL);

    const { result } = renderHook(() => useAgent('KAN-1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    fire('agent.state_changed', { key: 'KAN-1', from: 'running', to: 'pr_open', ts: 1 });

    await waitFor(() => {
      expect((qc.getQueryData(['agent', 'KAN-1']) as AgentDetail).state).toBe('pr_open');
    });
  });

  it('ignores agent.state_changed events for other keys', async () => {
    vi.spyOn(defaultClient, 'getAgent').mockResolvedValue(SAMPLE_DETAIL);

    const { result } = renderHook(() => useAgent('KAN-1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    fire('agent.state_changed', { key: 'OTHER-1', from: null, to: 'pr_open', ts: 1 });

    expect((qc.getQueryData(['agent', 'KAN-1']) as AgentDetail).state).toBe('running');
  });

  it('invalidates [agent, key] and [agents] when run.completed fires for the same key', async () => {
    vi.spyOn(defaultClient, 'getAgent').mockResolvedValue(SAMPLE_DETAIL);

    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useAgent('KAN-1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    fire('run.completed', { key: 'KAN-1', ts: 2 });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agent', 'KAN-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agents'] });
  });

  it('invalidates [agent, key] when tool_calls.changed fires for the same key (CREW-178)', async () => {
    vi.spyOn(defaultClient, 'getAgent').mockResolvedValue(SAMPLE_DETAIL);

    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useAgent('KAN-1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    invalidate.mockClear();
    fire('tool_calls.changed', { key: 'KAN-1' });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agent', 'KAN-1'] });
  });

  it('ignores tool_calls.changed for other keys', async () => {
    vi.spyOn(defaultClient, 'getAgent').mockResolvedValue(SAMPLE_DETAIL);

    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useAgent('KAN-1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    invalidate.mockClear();
    fire('tool_calls.changed', { key: 'OTHER-1' });

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('useStateHistory', () => {
  it('queries with key [agent, key, state-history] via defaultClient.getStateHistory', async () => {
    const spy = vi.spyOn(defaultClient, 'getStateHistory').mockResolvedValue(SAMPLE_HISTORY);

    const { result } = renderHook(() => useStateHistory('KAN-1'), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith('KAN-1');
    expect(result.current.data).toEqual(SAMPLE_HISTORY);
  });

  it('invalidates [agent, key, state-history] when agent.state_changed fires for the same key', async () => {
    vi.spyOn(defaultClient, 'getStateHistory').mockResolvedValue(SAMPLE_HISTORY);

    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useStateHistory('KAN-1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    fire('agent.state_changed', { key: 'KAN-1', from: null, to: 'pr_open', ts: 1 });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agent', 'KAN-1', 'state-history'] });
  });
});

describe('useProject', () => {
  it('queries with key [project, slug] via defaultClient.getProject', async () => {
    const spy = vi.spyOn(defaultClient, 'getProject').mockResolvedValue(SAMPLE_PROJECT_DETAIL);

    const { result } = renderHook(() => useProject('kanban-api'), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith('kanban-api');
    expect(result.current.data).toEqual(SAMPLE_PROJECT_DETAIL);
    expect(qc.getQueryData(['project', 'kanban-api'])).toEqual(SAMPLE_PROJECT_DETAIL);
  });
});

describe('useTimeline', () => {
  it('queries with key [agent, key, timeline] via defaultClient.getTimeline', async () => {
    const spy = vi.spyOn(defaultClient, 'getTimeline').mockResolvedValue(SAMPLE_TIMELINE);

    const { result } = renderHook(() => useTimeline('KAN-1'), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith('KAN-1');
    expect(result.current.data).toEqual(SAMPLE_TIMELINE);
  });

  it('invalidates [agent, key, timeline] when tool_calls.changed fires for the same key', async () => {
    vi.spyOn(defaultClient, 'getTimeline').mockResolvedValue(SAMPLE_TIMELINE);

    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useTimeline('KAN-1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    fire('tool_calls.changed', { key: 'KAN-1' });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agent', 'KAN-1', 'timeline'] });
  });

  it('ignores tool_calls.changed events for other keys', async () => {
    vi.spyOn(defaultClient, 'getTimeline').mockResolvedValue(SAMPLE_TIMELINE);

    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useTimeline('KAN-1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    invalidate.mockClear();
    fire('tool_calls.changed', { key: 'OTHER-1' });

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('useRefreshPrStatus (CREW-202)', () => {
  it('mutates via defaultClient.refreshPrStatus(key)', async () => {
    const spy = vi
      .spyOn(defaultClient, 'refreshPrStatus')
      .mockResolvedValue({ stateChanged: true, newState: 'pr_merged' });

    const { result } = renderHook(() => useRefreshPrStatus('KAN-1'), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith('KAN-1');
    expect(result.current.data).toEqual({ stateChanged: true, newState: 'pr_merged' });
  });

  it('invalidates agent + state-history + agents queries on success', async () => {
    vi.spyOn(defaultClient, 'refreshPrStatus').mockResolvedValue({
      stateChanged: true,
      newState: 'pr_merged',
    });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useRefreshPrStatus('KAN-1'), {
      wrapper: makeWrapper(qc),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const callKeys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(callKeys).toContain(JSON.stringify(['agent', 'KAN-1']));
    expect(callKeys).toContain(JSON.stringify(['agent', 'KAN-1', 'state-history']));
    expect(callKeys).toContain(JSON.stringify(['agents']));
  });
});
