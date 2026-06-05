import { describe, it, expect } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { createAptDepsCheck, aptDeps } from './apt-deps.js';

const ctx = { config: {} as ProjectConfig, worktree: '/tmp/x' };

describe('apt-deps', () => {
  it('the default export is a machine-scoped check with no fix (report-only)', () => {
    expect(aptDeps.name).toBe('apt-deps');
    expect(aptDeps.scope).toBe('machine');
    expect(aptDeps.fix).toBeUndefined();
  });

  it('skips gracefully (ok + note) when apt-get is not the package manager', async () => {
    const check = createAptDepsCheck({
      hasApt: () => false,
      onPath: () => false,
      hasChromiumLibs: async () => false,
    });
    const r = await check.detect(ctx);
    expect(r.status).toBe('ok');
    expect(r.details?.note).toMatch(/non-apt|skip/i);
  });

  it('ok when apt is present and every required dep is installed', async () => {
    const check = createAptDepsCheck({
      hasApt: () => true,
      onPath: () => true,
      hasChromiumLibs: async () => true,
    });
    const r = await check.detect(ctx);
    expect(r.status).toBe('ok');
  });

  it('fails listing the missing packages, with a sudo apt-get remediation', async () => {
    const check = createAptDepsCheck({
      hasApt: () => true,
      onPath: (cmd) => cmd !== 'socat', // socat missing, bwrap present
      hasChromiumLibs: async () => true,
    });
    const r = await check.detect(ctx);
    expect(r.status).toBe('fail');
    expect(r.remediation).toContain('sudo apt-get install');
    expect(r.remediation).toContain('socat');
    expect(r.details?.missing).toContain('socat');
  });

  it('includes the chromium runtime libs when they are absent', async () => {
    const check = createAptDepsCheck({
      hasApt: () => true,
      onPath: () => true,
      hasChromiumLibs: async () => false,
    });
    const r = await check.detect(ctx);
    expect(r.status).toBe('fail');
    expect(r.details?.missing).toContain('libnss3');
  });
});
