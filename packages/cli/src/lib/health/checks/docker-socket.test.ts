import { describe, it, expect } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { createDockerSocketCheck, dockerSocket } from './docker-socket.js';

const ctx = { config: {} as ProjectConfig, worktree: '/tmp/x' };

describe('docker-socket', () => {
  it('the default export is a machine-scoped check with no fix', () => {
    expect(dockerSocket.name).toBe('docker-socket');
    expect(dockerSocket.scope).toBe('machine');
    expect(dockerSocket.fix).toBeUndefined();
  });

  it('ok when the docker daemon is reachable', async () => {
    const check = createDockerSocketCheck({ reachable: async () => true });
    const r = await check.detect(ctx);
    expect(r.status).toBe('ok');
  });

  it('fails with remediation when the daemon is unreachable', async () => {
    const check = createDockerSocketCheck({ reachable: async () => false });
    const r = await check.detect(ctx);
    expect(r.status).toBe('fail');
    expect(r.fixable).toBeUndefined();
    expect(r.remediation).toMatch(/docker/i);
  });
});
