import { describe, it, expect } from 'vitest';
import { runHealth } from './run-health.js';
import { ok, fail, type HealthCheck, type HealthContext } from './types.js';

const ctx = { config: {} as never, worktree: '/tmp/x' } as HealthContext;

describe('runHealth', () => {
  it('runs all checks and collects results (no fail-fast)', async () => {
    const checks: HealthCheck[] = [
      { name: 'a', scope: 'project', detect: async () => fail('boom') },
      { name: 'b', scope: 'project', detect: async () => ok('fine') },
    ];
    const results = await runHealth(checks, ctx);
    expect(results.map((r) => [r.check.name, r.result.status])).toEqual([
      ['a', 'fail'],
      ['b', 'ok'],
    ]);
  });

  it('a throwing detect() becomes a fail result, not an exception', async () => {
    const checks: HealthCheck[] = [
      {
        name: 'x',
        scope: 'project',
        detect: async () => {
          throw new Error('kaboom');
        },
      },
    ];
    const [r] = await runHealth(checks, ctx);
    expect(r.result.status).toBe('fail');
    expect(r.result.headline).toContain('kaboom');
  });

  it('returns an empty array when given no checks', async () => {
    expect(await runHealth([], ctx)).toEqual([]);
  });
});
