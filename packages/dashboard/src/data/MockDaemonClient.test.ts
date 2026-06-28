import { projectTicketsResponseSchema } from 'crew-shared';
import { describe, expect, it } from 'vitest';

import { MockDaemonClient } from './MockDaemonClient.js';
import { FIXTURE_AGENTS, FIXTURE_PROJECT_DETAILS, FIXTURE_PROJECTS } from './fixtures.js';

describe('MockDaemonClient', () => {
  it('returns the fixture projects', async () => {
    const client = new MockDaemonClient();
    await expect(client.listProjects()).resolves.toEqual(FIXTURE_PROJECTS);
  });

  it('returns the fixture agents', async () => {
    const client = new MockDaemonClient();
    await expect(client.listAgents()).resolves.toEqual(FIXTURE_AGENTS);
  });

  it('accepts an override list of agents for tests', async () => {
    const client = new MockDaemonClient({ agents: [], projects: [] });
    await expect(client.listAgents()).resolves.toEqual([]);
    await expect(client.listProjects()).resolves.toEqual([]);
  });

  it('returns the fixture project detail for a known slug', async () => {
    const client = new MockDaemonClient();
    const detail = await client.getProject('kanban-api');
    expect(detail).toEqual(FIXTURE_PROJECT_DETAILS['kanban-api']);
  });

  it('throws ProjectNotFoundError for an unknown slug', async () => {
    const client = new MockDaemonClient();
    await expect(client.getProject('does-not-exist')).rejects.toMatchObject({
      name: 'ProjectNotFoundError',
    });
  });

  it('returns an empty runner page by default and the override when given (CREW-291)', async () => {
    await expect(new MockDaemonClient().getRunnerPage()).resolves.toEqual({
      failedToStart: [],
      queued: [],
      recentlyEnded: [],
    });

    const page = {
      failedToStart: [],
      queued: [
        { key: 'CREW-240', command: 'run' as const, project: '~/code/crew', queuedAt: 'now' },
      ],
      recentlyEnded: [],
    };
    await expect(new MockDaemonClient({ runnerPage: page }).getRunnerPage()).resolves.toEqual(page);
  });

  it('returns the seeded startup log for a key, else null (CREW-291)', async () => {
    const client = new MockDaemonClient({ startupLogs: { 'CREW-241': 'boom\nexit 1' } });
    await expect(client.getStartupLog('CREW-241')).resolves.toBe('boom\nexit 1');
    await expect(client.getStartupLog('CREW-999')).resolves.toBeNull();
  });

  it('returns a canned available ticket list parseable by the contract', async () => {
    const client = new MockDaemonClient();
    const res = await client.listProjectTickets();
    expect(() => projectTicketsResponseSchema.parse(res)).not.toThrow();
    if (!res.available) throw new Error('expected an available payload');
    // The canned payload exercises every row state the picker renders.
    const tickets = res.groups.flatMap((g) => g.tickets);
    expect(tickets.some((t) => t.runnable && !t.hasActiveAgent)).toBe(true);
    expect(tickets.some((t) => !t.runnable && t.blockedBy.length > 0)).toBe(true);
    expect(tickets.some((t) => t.hasActiveAgent)).toBe(true);
  });
});
