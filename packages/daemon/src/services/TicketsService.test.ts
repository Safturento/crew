import { describe, it, expect, vi } from 'vitest';
import { TicketsService } from './TicketsService.js';
import type { ProjectConfig } from 'crew-shared';

const project = {
  name: 'crew',
  jira: {
    project_key: 'CREW',
    site: 'https://x.atlassian.net',
    ready_status: 'Ready for Development',
  },
} as unknown as ProjectConfig;

const logger = { warn: vi.fn(), info: vi.fn() } as never;

function svc(opts: {
  email?: string;
  token?: string;
  search?: () => Promise<unknown>;
  active?: Set<string>;
}) {
  const agentsService = {
    activeTicketKeys: vi.fn().mockResolvedValue(opts.active ?? new Set()),
  } as never;
  const service = new TicketsService({
    jiraEmail: opts.email ?? 'e@x',
    jiraToken: opts.token ?? 't',
    agentsService,
    logger,
  });
  if (opts.search) {
    (service as unknown as { makeClient: () => unknown }).makeClient = () => ({
      searchIssues: opts.search,
    });
  }
  return service;
}

describe('TicketsService.listProjectTickets', () => {
  it('returns no_credentials when creds are empty', async () => {
    const res = await svc({ email: '', token: '' }).listProjectTickets(project);
    expect(res).toEqual({ available: false, reason: 'no_credentials' });
  });

  it('returns jira_unreachable when the search throws', async () => {
    const res = await svc({ search: () => Promise.reject(new Error('boom')) }).listProjectTickets(
      project,
    );
    expect(res).toEqual({ available: false, reason: 'jira_unreachable' });
  });

  it('groups by parent epic and marks blocked tickets', async () => {
    const search = () =>
      Promise.resolve([
        {
          key: 'CREW-2',
          fields: {
            summary: 'Blocked one',
            status: { name: 'Ready for Development' },
            parent: { key: 'CREW-100', fields: { summary: 'Epic A' } },
            priority: { name: 'High' },
            issuelinks: [
              {
                type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
                inwardIssue: {
                  key: 'CREW-1',
                  fields: {
                    summary: 'Blocker',
                    status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
                  },
                },
              },
            ],
          },
        },
        {
          key: 'CREW-3',
          fields: { summary: 'Runnable, no epic', status: { name: 'Ready for Development' } },
        },
      ]);
    const res = await svc({ search, active: new Set(['CREW-3']) }).listProjectTickets(project);
    if (!res.available) throw new Error('expected available');
    expect(res.groups).toHaveLength(2);
    const epicA = res.groups.find((g) => g.epicKey === 'CREW-100')!;
    expect(epicA.epicSummary).toBe('Epic A');
    expect(epicA.tickets[0]).toMatchObject({
      key: 'CREW-2',
      runnable: false,
      blockedBy: [{ key: 'CREW-1', summary: 'Blocker' }],
      priority: 'High',
    });
    const ungrouped = res.groups.find((g) => g.epicKey === null)!;
    expect(ungrouped.tickets[0]).toMatchObject({
      key: 'CREW-3',
      runnable: true,
      hasActiveAgent: true,
    });
  });

  it('flags interactive from the interactive label', async () => {
    const search = () =>
      Promise.resolve([
        {
          key: 'CREW-2',
          fields: {
            summary: 's',
            status: { name: 'Ready for Development' },
            labels: ['interactive', 'frontend'],
          },
        },
      ]);
    const res = await svc({ search }).listProjectTickets(project);
    if (!res.available) throw new Error('expected available');
    expect(res.groups[0].tickets[0].interactive).toBe(true);
  });

  it('interactive is false when the label is absent', async () => {
    const search = () =>
      Promise.resolve([
        {
          key: 'CREW-3',
          fields: { summary: 's', status: { name: 'Ready for Development' }, labels: ['frontend'] },
        },
      ]);
    const res = await svc({ search }).listProjectTickets(project);
    if (!res.available) throw new Error('expected available');
    expect(res.groups[0].tickets[0].interactive).toBe(false);
  });

  it('requests the labels field from Jira', async () => {
    const search = vi.fn().mockResolvedValue([]);
    await svc({ search }).listProjectTickets(project);
    const [, fields] = search.mock.calls[0];
    expect(fields).toContain('labels');
  });

  it('treats a Done blocker as not blocking', async () => {
    const search = () =>
      Promise.resolve([
        {
          key: 'CREW-4',
          fields: {
            summary: 'X',
            status: { name: 'Ready for Development' },
            issuelinks: [
              {
                type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
                inwardIssue: {
                  key: 'CREW-1',
                  fields: {
                    summary: 'Done blocker',
                    status: { name: 'Done', statusCategory: { key: 'done' } },
                  },
                },
              },
            ],
          },
        },
      ]);
    const res = await svc({ search }).listProjectTickets(project);
    if (!res.available) throw new Error('expected available');
    expect(res.groups[0].tickets[0]).toMatchObject({
      key: 'CREW-4',
      runnable: true,
      blockedBy: [],
    });
  });
});
