import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureStackRunning } from './ensure-stack-running.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

import { execa } from 'execa';
const execaMock = vi.mocked(execa);

function fakeProcess(rc: number) {
  const proc = {
    stdout: { pipe: vi.fn() },
    stderr: { pipe: vi.fn() },
  };
  return Object.assign(Promise.resolve({ exitCode: rc }), proc);
}

describe('ensureStackRunning', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `crew-ensure-stack-${process.pid}-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    execaMock.mockReset();
  });

  afterEach(() => {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  });

  it('spawns `docker compose up -d` in the worktree (no --build)', async () => {
    execaMock.mockReturnValue(fakeProcess(0) as unknown as ReturnType<typeof execa>);

    await ensureStackRunning({ worktree: tmp, key: 'KAN-99', env: { PATH: '/usr/bin' } });

    expect(execaMock).toHaveBeenCalledTimes(1);
    const call = execaMock.mock.calls[0] as unknown as [
      string,
      string[],
      Record<string, unknown>,
    ];
    const [cmd, args, options] = call;
    expect(cmd).toBe('docker');
    expect(args).toEqual(['compose', 'up', '-d']);
    expect(args).not.toContain('--build');
    expect((options as { cwd: string }).cwd).toBe(tmp);
  });

  it('returns rc 0 and the canonical log path on success', async () => {
    execaMock.mockReturnValue(fakeProcess(0) as unknown as ReturnType<typeof execa>);

    const result = await ensureStackRunning({
      worktree: tmp,
      key: 'KAN-99',
      env: process.env,
    });

    expect(result.rc).toBe(0);
    expect(result.logPath).toBe('/tmp/crew-docker-KAN-99.log');
  });

  it('returns the non-zero rc without throwing on failure', async () => {
    execaMock.mockReturnValue(fakeProcess(1) as unknown as ReturnType<typeof execa>);

    const result = await ensureStackRunning({
      worktree: tmp,
      key: 'KAN-99',
      env: process.env,
    });

    expect(result.rc).toBe(1);
    expect(result.logPath).toBe('/tmp/crew-docker-KAN-99.log');
  });

  it('forwards the supplied env through to execa', async () => {
    execaMock.mockReturnValue(fakeProcess(0) as unknown as ReturnType<typeof execa>);

    await ensureStackRunning({
      worktree: tmp,
      key: 'KAN-99',
      env: { PATH: '/usr/bin', CUSTOM: 'value' },
    });

    const options = execaMock.mock.calls[0]?.[2] as { env: Record<string, string> };
    expect(options.env.CUSTOM).toBe('value');
  });
});
