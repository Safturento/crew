import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPrForBranch,
  getReviewComments,
  getIssueComments,
  getReviews,
  mergeStatus,
} from './index.js';
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

describe('getIssueComments', () => {
  it('returns the top-level PR comments via REST', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { user: { login: 'alice' }, created_at: '2026-04-26T10:00:00Z', body: 'looks good' },
        { user: { login: 'bob' }, created_at: '2026-04-26T11:00:00Z', body: 'one nit' },
      ]),
    } as never);

    const comments = await getIssueComments('Safturento', 'crew', 7);

    expect(comments).toHaveLength(2);
    expect(comments[0]).toEqual({
      author: 'alice',
      createdAt: '2026-04-26T10:00:00Z',
      body: 'looks good',
    });
    const [, args] = mockedExeca.mock.calls[0]!;
    expect(args).toEqual(['api', 'repos/Safturento/crew/issues/7/comments']);
  });
});

describe('getReviews', () => {
  it('returns reviews with non-empty bodies only', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { user: { login: 'alice' }, state: 'APPROVED', body: '' },
        { user: { login: 'bob' }, state: 'CHANGES_REQUESTED', body: 'rework needed' },
        { user: { login: 'carol' }, state: 'COMMENTED', body: null },
      ]),
    } as never);

    const reviews = await getReviews('Safturento', 'crew', 7);

    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toEqual({
      author: 'bob',
      state: 'CHANGES_REQUESTED',
      body: 'rework needed',
    });
    const [, args] = mockedExeca.mock.calls[0]!;
    expect(args).toEqual(['api', 'repos/Safturento/crew/pulls/7/reviews']);
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
