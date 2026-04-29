import { describe, it, expect, vi } from 'vitest';
import { HybridDaemonClient } from './HybridDaemonClient.js';
import type { Agent, Project } from './types.js';

describe('HybridDaemonClient', () => {
  it('listProjects delegates to the http client', async () => {
    const projects: Project[] = [{ name: 'demo', repoPath: '/x' }];
    const http = { listProjects: vi.fn().mockResolvedValue(projects) };
    const mock = { listAgents: vi.fn() };
    const client = new HybridDaemonClient(http, mock as never);

    expect(await client.listProjects()).toBe(projects);
    expect(http.listProjects).toHaveBeenCalledOnce();
  });

  it('listAgents delegates to the mock client', async () => {
    const agents: Agent[] = [];
    const http = { listProjects: vi.fn() };
    const mock = { listAgents: vi.fn().mockResolvedValue(agents) };
    const client = new HybridDaemonClient(http as never, mock as never);

    expect(await client.listAgents()).toBe(agents);
    expect(mock.listAgents).toHaveBeenCalledOnce();
  });
});
