import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execa } from 'execa';
import { assemblePrFeedback } from './feedback.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

const mockedExeca = vi.mocked(execa);

beforeEach(() => mockedExeca.mockReset());

function mockGh(responses: string[]): void {
  for (const stdout of responses) {
    mockedExeca.mockResolvedValueOnce({ stdout } as never);
  }
}

describe('assemblePrFeedback', () => {
  it('combines top-level comments, reviews, and unresolved threads into a markdown block', async () => {
    mockGh([
      JSON.stringify([
        { user: { login: 'alice' }, created_at: '2026-04-26T10:00:00Z', body: 'looks good' },
      ]),
      JSON.stringify([
        { user: { login: 'bob' }, state: 'CHANGES_REQUESTED', body: 'rework needed' },
      ]),
      JSON.stringify({
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
                          author: { login: 'carol' },
                          path: 'src/foo.ts',
                          line: 10,
                          originalLine: null,
                          body: 'use let',
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
    ]);

    const md = await assemblePrFeedback({
      owner: 'Safturento',
      repo: 'crew',
      prNumber: 7,
      prUrl: 'https://github.com/Safturento/crew/pull/7',
    });

    expect(md).toContain('## PR review feedback (PR #7)');
    expect(md).toContain('https://github.com/Safturento/crew/pull/7');
    expect(md).toContain('### Top-level PR comments');
    expect(md).toContain('@alice');
    expect(md).toContain('looks good');
    expect(md).toContain('### Review summaries');
    expect(md).toContain('@bob');
    expect(md).toContain('[CHANGES_REQUESTED]');
    expect(md).toContain('### Inline review comments (unresolved threads only)');
    expect(md).toContain('src/foo.ts:10');
    expect(md).toContain('@carol');
    expect(md).toContain('use let');
  });

  it('returns the empty marker when no feedback exists', async () => {
    mockGh([
      '[]',
      '[]',
      JSON.stringify({
        data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } },
      }),
    ]);

    const md = await assemblePrFeedback({
      owner: 'Safturento',
      repo: 'crew',
      prNumber: 7,
      prUrl: 'https://github.com/Safturento/crew/pull/7',
    });

    expect(md).toContain('(no review feedback found');
  });

  it('omits sections that are empty', async () => {
    mockGh([
      '[]',
      JSON.stringify([{ user: { login: 'bob' }, state: 'COMMENTED', body: 'thoughts' }]),
      JSON.stringify({
        data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } },
      }),
    ]);

    const md = await assemblePrFeedback({
      owner: 'Safturento',
      repo: 'crew',
      prNumber: 7,
      prUrl: 'https://github.com/Safturento/crew/pull/7',
    });

    expect(md).not.toContain('### Top-level PR comments');
    expect(md).toContain('### Review summaries');
    expect(md).not.toContain('### Inline review comments');
  });
});

describe('assemblePrFeedback isEmpty marker', () => {
  it('exports a stable prefix to detect the empty case', async () => {
    mockGh([
      '[]',
      '[]',
      JSON.stringify({
        data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } },
      }),
    ]);

    const md = await assemblePrFeedback({
      owner: 'Safturento',
      repo: 'crew',
      prNumber: 7,
      prUrl: 'https://github.com/Safturento/crew/pull/7',
    });

    expect(md).toMatch(/^\(no review feedback found/m);
  });
});
