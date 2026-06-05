import { describe, it, expect, vi } from 'vitest';
import { runUp } from './up.js';
import { runDown } from './down.js';

describe('runUp', () => {
  it('brings the compose stack up detached, then starts the runner', async () => {
    const calls: string[][] = [];
    const exec = vi.fn(async (file: string, args: string[]) => {
      calls.push([file, ...args]);
    });
    await runUp({ exec, log: vi.fn(), ensureRunnerDir: vi.fn() });
    expect(calls).toEqual([
      ['docker', 'compose', 'up', '-d'],
      ['crew', 'runner', 'start'],
    ]);
  });

  it('pre-creates the host runner dir before compose can mount it', async () => {
    const order: string[] = [];
    const exec = vi.fn(async (file: string, args: string[]) => {
      order.push([file, ...args].join(' '));
    });
    const ensureRunnerDir = vi.fn(() => {
      order.push('ensure-runner-dir');
    });
    await runUp({ exec, log: vi.fn(), ensureRunnerDir });
    expect(order[0]).toBe('ensure-runner-dir');
    expect(order.indexOf('ensure-runner-dir')).toBeLessThan(order.indexOf('docker compose up -d'));
  });
});

describe('runDown', () => {
  it('stops the runner first, then tears the compose stack down', async () => {
    const calls: string[][] = [];
    const exec = vi.fn(async (file: string, args: string[]) => {
      calls.push([file, ...args]);
    });
    await runDown({ exec, log: vi.fn() });
    expect(calls).toEqual([
      ['crew', 'runner', 'stop'],
      ['docker', 'compose', 'down'],
    ]);
  });
});
