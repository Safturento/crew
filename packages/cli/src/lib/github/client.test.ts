import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPrForBranch, getReviewComments, mergeStatus } from './index.js';
import { execa } from 'execa';

vi.mock('execa', () => ({ execa: vi.fn() }));

const mockedExeca = vi.mocked(execa);

beforeEach(() => mockedExeca.mockReset());

describe('getPrForBranch', () => {
  it('returns the matching PR or null', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([{ number: 42, state: 'OPEN', url: 'https://...' }]),
    } as never);

    const pr = await getPrForBranch('KAN-1');
    expect(pr).toEqual({ number: 42, state: 'OPEN', url: 'https://...' });
  });

  it('returns null when gh reports no PRs', async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: '[]' } as never);
    expect(await getPrForBranch('KAN-1')).toBeNull();
  });
});

describe('mergeStatus', () => {
  it('returns the PR state', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'MERGED', mergedAt: '2026-04-26T00:00:00Z' }),
    } as never);

    const status = await mergeStatus(42);
    expect(status.state).toBe('MERGED');
  });
});

describe('getReviewComments', () => {
  it('returns unresolved review-thread comments via GraphQL', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  {
                    isResolved: false,
                    comments: {
                      nodes: [
                        {
                          author: { login: 'reviewer' },
                          path: 'src/foo.ts',
                          line: 10,
                          originalLine: null,
                          body: 'use let',
                        },
                      ],
                    },
                  },
                  {
                    isResolved: true,
                    comments: {
                      nodes: [
                        {
                          author: { login: 'x' },
                          path: 'y',
                          line: 1,
                          originalLine: null,
                          body: 'old',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    } as never);

    const comments = await getReviewComments('Safturento', 'crew', 1);
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe('use let');
  });
});
