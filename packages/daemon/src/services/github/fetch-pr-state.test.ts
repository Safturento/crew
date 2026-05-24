import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import { fetchPrStateViaGh } from './fetch-pr-state.js';

const mockedExeca = vi.mocked(execa);

afterEach(() => {
  mockedExeca.mockReset();
});

describe('fetchPrStateViaGh', () => {
  it('returns MERGED when gh reports state=MERGED', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'MERGED' }),
    } as never);
    expect(await fetchPrStateViaGh('https://github.com/o/r/pull/1')).toBe('MERGED');
  });

  it('returns CLOSED when gh reports state=CLOSED', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'CLOSED' }),
    } as never);
    expect(await fetchPrStateViaGh('https://github.com/o/r/pull/2')).toBe('CLOSED');
  });

  it('returns OPEN when gh reports state=OPEN', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'OPEN' }),
    } as never);
    expect(await fetchPrStateViaGh('https://github.com/o/r/pull/3')).toBe('OPEN');
  });

  it('invokes `gh pr view <url> --json state`', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'OPEN' }),
    } as never);
    await fetchPrStateViaGh('https://github.com/o/r/pull/5');
    expect(mockedExeca).toHaveBeenCalledWith('gh', [
      'pr',
      'view',
      'https://github.com/o/r/pull/5',
      '--json',
      'state',
    ]);
  });

  it('propagates errors from gh (caller is expected to catch + log)', async () => {
    mockedExeca.mockRejectedValueOnce(new Error('gh: command not found'));
    await expect(fetchPrStateViaGh('https://github.com/o/r/pull/9')).rejects.toThrow(
      'gh: command not found',
    );
  });
});
