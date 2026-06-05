import { describe, it, expect, vi } from 'vitest';
import { runUp } from './up.js';
import { runDown } from './down.js';

describe('runUp', () => {
  it('brings the compose stack up detached, then starts the runner', async () => {
    const calls: string[][] = [];
    const exec = vi.fn(async (file: string, args: string[]) => {
      calls.push([file, ...args]);
    });
    await runUp({ exec, log: vi.fn() });
    expect(calls).toEqual([
      ['docker', 'compose', 'up', '-d'],
      ['crew', 'runner', 'start'],
    ]);
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
