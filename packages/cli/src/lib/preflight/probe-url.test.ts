import { describe, it, expect, vi, beforeEach } from 'vitest';
import { probeUrl } from './probe-url.js';

describe('probeUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns reachable: true on first successful HTTP response', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 200 }));
    const result = await probeUrl('https://localhost:17253', { delays: [0] });
    expect(result.reachable).toBe(true);
    expect(result.attempts).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('treats 4xx and 5xx as reachable (server is up)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    const result = await probeUrl('https://localhost:17253', { delays: [0] });
    expect(result.reachable).toBe(true);
  });

  it('retries on ECONNREFUSED then succeeds', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      if (calls < 3)
        throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      return new Response('', { status: 200 });
    });

    const result = await probeUrl('https://localhost:17253', { delays: [0, 0, 0] });
    expect(result.reachable).toBe(true);
    expect(result.attempts).toBe(3);
  });

  it('returns reachable: false after all retries exhausted', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    );
    const result = await probeUrl('https://localhost:17253', { delays: [0, 0, 0] });
    expect(result.reachable).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.lastError?.code).toBe('ECONNREFUSED');
  });

  it('uses default exponential backoff when delays not provided', async () => {
    const { DEFAULT_RETRY_DELAYS_MS } = await import('./probe-url.js');
    expect(DEFAULT_RETRY_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 16000]);
  });
});
