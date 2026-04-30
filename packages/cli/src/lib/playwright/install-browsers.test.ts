import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installPlaywrightBrowsers } from './install-browsers.js';

vi.mock('execa', () => {
  return {
    execa: vi.fn(),
  };
});

import { execa } from 'execa';
const execaMock = vi.mocked(execa);

describe('installPlaywrightBrowsers', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `crew-pw-test-${process.pid}-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    execaMock.mockReset();
  });

  afterEach(() => {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  });

  function fakeProcess(rc: number, stdout = '', stderr = '') {
    const proc = {
      stdout: { pipe: vi.fn() },
      stderr: { pipe: vi.fn() },
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(onFulfilled({ exitCode: rc })),
    };
    return Object.assign(Promise.resolve({ exitCode: rc, stdout, stderr }), proc);
  }

  it('spawns `npx playwright install chromium` with the given cwd and env', async () => {
    execaMock.mockReturnValue(fakeProcess(0) as unknown as ReturnType<typeof execa>);

    await installPlaywrightBrowsers({
      worktree: tmp,
      key: 'KAN-99',
      env: { PATH: '/usr/bin', FOO: 'bar' },
    });

    expect(execaMock).toHaveBeenCalledTimes(1);
    const call = execaMock.mock.calls[0] as unknown as [string, string[], Record<string, unknown>];
    const [cmd, args, options] = call;
    expect(cmd).toBe('npx');
    expect(args).toEqual(['playwright', 'install', 'chromium']);
    expect((options as { cwd: string }).cwd).toBe(tmp);
    expect((options as { env: Record<string, string> }).env.FOO).toBe('bar');
  });

  it('returns rc 0 and a log path on success', async () => {
    execaMock.mockReturnValue(fakeProcess(0) as unknown as ReturnType<typeof execa>);
    const result = await installPlaywrightBrowsers({
      worktree: tmp,
      key: 'KAN-99',
      env: process.env,
    });
    expect(result.rc).toBe(0);
    expect(result.logPath).toBe('/tmp/crew-playwright-KAN-99.log');
  });

  it('returns non-zero rc on failure (does not throw)', async () => {
    execaMock.mockReturnValue(fakeProcess(1, '', 'error') as unknown as ReturnType<typeof execa>);
    const result = await installPlaywrightBrowsers({
      worktree: tmp,
      key: 'KAN-99',
      env: process.env,
    });
    expect(result.rc).toBe(1);
    expect(result.logPath).toBe('/tmp/crew-playwright-KAN-99.log');
  });
});
