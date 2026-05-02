import { describe, expect, it } from 'vitest';
import { dockerDaemonReachable } from './daemon-reachable.js';

describe('dockerDaemonReachable', () => {
  it('returns false when the docker binary is not on PATH', async () => {
    // Spawning a missing executable is fast (ENOENT, no socket retries) and
    // exercises the same code path as a dead daemon — execa returns a
    // non-zero exitCode and the helper interprets that as "unreachable".
    const reachable = await dockerDaemonReachable({
      env: { ...process.env, PATH: '/nonexistent' },
      timeoutMs: 1500,
    });
    expect(reachable).toBe(false);
  });
});
