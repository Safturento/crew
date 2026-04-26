import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execa } from 'execa';
import { preflightTools, hasBinary } from './preflight.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

const mockedExeca = vi.mocked(execa);

beforeEach(() => {
  mockedExeca.mockReset();
});

describe('hasBinary', () => {
  it('returns true when `which` resolves successfully', async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: '/usr/bin/claude' } as never);

    expect(await hasBinary('claude')).toBe(true);
    expect(mockedExeca).toHaveBeenCalledWith('which', ['claude']);
  });

  it('returns false when `which` rejects', async () => {
    mockedExeca.mockRejectedValueOnce(new Error('not found'));

    expect(await hasBinary('nope')).toBe(false);
  });
});

describe('preflightTools', () => {
  it('returns an empty list when every binary is on PATH', async () => {
    mockedExeca.mockResolvedValue({ stdout: '/usr/bin/x' } as never);

    expect(await preflightTools(['claude', 'gh', 'jq'])).toEqual([]);
    expect(mockedExeca).toHaveBeenCalledTimes(3);
  });

  it('returns the names of binaries `which` could not resolve', async () => {
    mockedExeca
      .mockResolvedValueOnce({ stdout: '/usr/bin/claude' } as never)
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({ stdout: '/usr/bin/jq' } as never)
      .mockRejectedValueOnce(new Error('not found'));

    expect(await preflightTools(['claude', 'gh', 'jq', 'bwrap'])).toEqual(['gh', 'bwrap']);
  });

  it('preserves the input order in the missing list', async () => {
    mockedExeca
      .mockRejectedValueOnce(new Error('not found'))
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({ stdout: '/usr/bin/x' } as never);

    expect(await preflightTools(['a', 'b', 'c'])).toEqual(['a', 'b']);
  });
});
