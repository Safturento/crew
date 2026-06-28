import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { RunnerPage } from 'crew-shared';

import { useRunnerPageData } from './useRunnerPageData.js';
import { eventStream } from '@/data/eventStream';
import { defaultClient } from '@/data/queries';
import type { Agent } from '@/data/types';

let qc: QueryClient;

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  // The hooks subscribe to SSE; stub it out so nothing fires during the test.
  vi.spyOn(eventStream, 'on').mockReturnValue(() => {});
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.restoreAllMocks();
  qc.clear();
});

const PAGE: RunnerPage = {
  failedToStart: [
    {
      key: 'CREW-241',
      command: 'run',
      project: 'crew',
      failedAt: '2026-06-25T14:30:41.000Z',
      failure: { check: 'repo-config', headline: 'boom', remediation: 'fix', output: 'exit 1' },
    },
  ],
  queued: [{ key: 'CREW-240', command: 'run', project: 'crew', queuedAt: '2026-06-25T14:28:00Z' }],
  recentlyEnded: [
    { key: 'CREW-227', command: 'run', project: 'crew', endedAt: '2026-06-25T14:42:00Z', kind: 'finished' },
  ],
};

describe('useRunnerPageData', () => {
  it('merges /api/runner/page into the three sections and derives unmanaged', async () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockResolvedValue({
      online: true,
      lastSeen: 1,
      processes: [],
    });
    vi.spyOn(defaultClient, 'getRunnerPage').mockResolvedValue(PAGE);

    const agents: Agent[] = [
      // running in the DB but absent from the (empty) live snapshot → unmanaged
      {
        key: 'CREW-300',
        projectName: 'crew',
        ticketTitle: 'Orphan',
        state: 'running',
        startedAt: '2026-06-25T14:00:00Z',
        tokens: 0,
      },
    ];

    const { result } = renderHook(() => useRunnerPageData(agents), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.failedToStart).toHaveLength(1));
    expect(result.current.failedToStart[0]?.key).toBe('CREW-241');
    expect(result.current.queued[0]?.key).toBe('CREW-240');
    expect(result.current.recentlyEnded[0]?.key).toBe('CREW-227');
    expect(result.current.unmanaged.map((u) => u.key)).toEqual(['CREW-300']);
  });

  it('starts with empty section lists before the page query resolves', () => {
    vi.spyOn(defaultClient, 'getRunnerStatus').mockReturnValue(new Promise(() => {}));
    vi.spyOn(defaultClient, 'getRunnerPage').mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useRunnerPageData([]), { wrapper: makeWrapper(qc) });

    expect(result.current.failedToStart).toEqual([]);
    expect(result.current.queued).toEqual([]);
    expect(result.current.recentlyEnded).toEqual([]);
  });
});
