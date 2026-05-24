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
  it('returns MERGED when GitHub reports merged: true (state ignored)', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'MERGED', merged: true }),
    } as never);
    expect(await fetchPrStateViaGh('https://github.com/o/r/pull/1')).toBe('MERGED');
  });

  it('returns CLOSED when state=CLOSED and merged: false', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'CLOSED', merged: false }),
    } as never);
    expect(await fetchPrStateViaGh('https://github.com/o/r/pull/2')).toBe('CLOSED');
  });

  it('returns OPEN when state=OPEN', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'OPEN', merged: false }),
    } as never);
    expect(await fetchPrStateViaGh('https://github.com/o/r/pull/3')).toBe('OPEN');
  });

  it('invokes `gh pr view <url> --json state,merged`', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'OPEN', merged: false }),
    } as never);
    await fetchPrStateViaGh('https://github.com/o/r/pull/5');
    expect(mockedExeca).toHaveBeenCalledWith('gh', [
      'pr',
      'view',
      'https://github.com/o/r/pull/5',
      '--json',
      'state,merged',
    ]);
  });

  it('propagates errors from gh (caller is expected to catch + log)', async () => {
    mockedExeca.mockRejectedValueOnce(new Error('gh: command not found'));
    await expect(fetchPrStateViaGh('https://github.com/o/r/pull/9')).rejects.toThrow(
      'gh: command not found',
    );
  });
});
