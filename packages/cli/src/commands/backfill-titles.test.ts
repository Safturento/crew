import { describe, expect, it, vi, afterEach } from 'vitest';
import { runBackfillTitles } from './backfill-titles.js';
import type { ProjectConfig } from 'crew-shared';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

const baseConfig: ProjectConfig = {
  name: 'demo',
  repo_path: '/home/u/Repos/demo',
  default_branch: 'main',
  jira: { project_key: 'DEMO', site: 'https://x.atlassian.net', ready_status: 'Ready for Development' },
  github: { repo: 'u/demo' },
  db_clone: {
    postgres_service: 'postgres',
    postgres_user: 'postgres',
    postgres_database: 'postgres',
    required_tables: [],
    exclude_tables: ['kysely_migration*'],
  },
};

function makeDaemonClient(
  list: { agents: Array<{ key: string; projectName: string; ticketTitle: string }> },
  updates: Map<string, string> = new Map(),
): {
  listAgents: ReturnType<typeof vi.fn>;
  updateTicketTitle: ReturnType<typeof vi.fn>;
  capturedUpdates: Map<string, string>;
} {
  const listAgents = vi.fn().mockResolvedValue(list);
  const updateTicketTitle = vi
    .fn()
    .mockImplementation(async (key: string, title: string) => {
      updates.set(key, title);
      return { ok: true };
    });
  return {
    listAgents,
    updateTicketTitle,
    capturedUpdates: updates,
  };
}

describe('runBackfillTitles', () => {
  it('returns ok=false when Jira creds are missing', async () => {
    const { listAgents, updateTicketTitle } = makeDaemonClient({ agents: [] });
    const result = await runBackfillTitles({
      config: baseConfig,
      daemonClient: { listAgents, updateTicketTitle } as never,
      jiraSecrets: null,
      log: () => {},
      warn: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/CREW_JIRA/);
    expect(listAgents).not.toHaveBeenCalled();
    expect(updateTicketTitle).not.toHaveBeenCalled();
  });

  it('fills empty titles for agents in the current project and skips others', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const m = String(url).match(/\/rest\/api\/3\/issue\/([^/]+)$/);
      if (!m) throw new Error(`unexpected URL: ${url}`);
      const key = m[1]!;
      return new Response(
        JSON.stringify({ key, fields: { summary: `Summary for ${key}` } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const captured = new Map<string, string>();
    const { listAgents, updateTicketTitle } = makeDaemonClient(
      {
        agents: [
          { key: 'DEMO-1', projectName: 'demo', ticketTitle: '' },
          { key: 'DEMO-2', projectName: 'demo', ticketTitle: 'already filled' },
          { key: 'OTHER-1', projectName: 'other-project', ticketTitle: '' },
          { key: 'DEMO-3', projectName: 'demo', ticketTitle: '' },
        ],
      },
      captured,
    );

    const result = await runBackfillTitles({
      config: baseConfig,
      daemonClient: { listAgents, updateTicketTitle } as never,
      jiraSecrets: { email: 'e@x', token: 'tok' },
      log: () => {},
      warn: () => {},
    });

    expect(result.ok).toBe(true);
    expect(result.attempted).toBe(2);
    expect(result.filled).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(2);
    expect(captured.get('DEMO-1')).toBe('Summary for DEMO-1');
    expect(captured.get('DEMO-3')).toBe('Summary for DEMO-3');
    expect(captured.has('DEMO-2')).toBe(false);
    expect(captured.has('OTHER-1')).toBe(false);
  });

  it('counts Jira fetch failures as `failed` and continues with remaining agents', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('DEMO-1')) {
        return new Response('Not Found', { status: 404 });
      }
      const m = String(url).match(/\/rest\/api\/3\/issue\/([^/]+)$/);
      const key = m?.[1] ?? '?';
      return new Response(
        JSON.stringify({ key, fields: { summary: `Summary for ${key}` } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const captured = new Map<string, string>();
    const { listAgents, updateTicketTitle } = makeDaemonClient(
      {
        agents: [
          { key: 'DEMO-1', projectName: 'demo', ticketTitle: '' },
          { key: 'DEMO-2', projectName: 'demo', ticketTitle: '' },
        ],
      },
      captured,
    );

    const result = await runBackfillTitles({
      config: baseConfig,
      daemonClient: { listAgents, updateTicketTitle } as never,
      jiraSecrets: { email: 'e@x', token: 'tok' },
      log: () => {},
      warn: () => {},
    });

    expect(result.ok).toBe(true);
    expect(result.attempted).toBe(2);
    expect(result.filled).toBe(1);
    expect(result.failed).toBe(1);
    expect(captured.get('DEMO-2')).toBe('Summary for DEMO-2');
    expect(captured.has('DEMO-1')).toBe(false);
  });
});
