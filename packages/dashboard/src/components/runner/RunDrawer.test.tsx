import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { LiveProcess } from 'crew-shared';

import { RunDrawer, type RunDrawerSource } from './RunDrawer.js';
import { defaultClient } from '@/data/queries';
import type { EndedRunView, FailedStartView } from './types.js';

let qc: QueryClient;

function renderDrawer(source: RunDrawerSource) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<RunDrawer source={source} open onOpenChange={() => {}} />, { wrapper });
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.restoreAllMocks();
  qc.clear();
});

const FAILED: FailedStartView = {
  key: 'CREW-241',
  command: 'run',
  project: '~/code/crew',
  failedAt: new Date(Date.now() - 120_000).toISOString(),
  failure: {
    check: 'repo-config',
    headline: "Remote 'origin' not found in project config",
    remediation: 'set repo.remote in crew.toml',
    output: 'fallback output line',
  },
};

const LIVE: LiveProcess = {
  agentKey: 'CREW-231',
  command: 'run',
  pid: 48213,
  pgid: 48213,
  actionRequestId: null,
  spawnedAt: new Date(Date.now() - 60_000).toISOString(),
  state: 'running',
  project: '~/code/crew',
};

const ENDED_FINISHED: EndedRunView = {
  key: 'CREW-227',
  command: 'run',
  project: '~/code/crew',
  endedAt: new Date(Date.now() - 240_000).toISOString(),
  kind: 'finished',
  prUrl: 'https://example.com/pr/340',
  prNumber: 340,
};

describe('RunDrawer', () => {
  it('renders a failed-start run: header, diagnosis, and the startup console log', async () => {
    vi.spyOn(defaultClient, 'getStartupLog').mockResolvedValue(
      '$ crew run CREW-241\n[preflight] aborting before worktree creation\nexit code 1',
    );

    renderDrawer({ kind: 'failed-start', view: FAILED });

    // Header
    expect(screen.getByRole('heading', { name: 'CREW-241' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName('failed');

    // Diagnosis
    expect(screen.getByText('repo-config')).toBeInTheDocument();
    expect(screen.getByText("Remote 'origin' not found in project config")).toBeInTheDocument();
    expect(screen.getByText('→ set repo.remote in crew.toml')).toBeInTheDocument();

    // Console — fetched startup log
    expect(await screen.findByText(/aborting before worktree creation/)).toBeInTheDocument();
  });

  it('falls back to failure.output when no startup log was captured (404 → null)', async () => {
    vi.spyOn(defaultClient, 'getStartupLog').mockResolvedValue(null);

    renderDrawer({ kind: 'failed-start', view: FAILED });

    expect(await screen.findByText('fallback output line')).toBeInTheDocument();
  });

  it('renders a live run: running pill, pid/pgid meta, and a live console indicator', async () => {
    vi.spyOn(defaultClient, 'getStartupLog').mockResolvedValue('[claude] session started');

    renderDrawer({ kind: 'live', process: LIVE });

    expect(screen.getByRole('heading', { name: 'CREW-231' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName('running');
    expect(screen.getAllByText('48213')).toHaveLength(2); // pid + pgid
    expect(screen.getByText('live')).toBeInTheDocument();
    // No diagnosis section for a non-failed run.
    expect(screen.queryByText('Diagnosis')).toBeNull();
    expect(await screen.findByText(/session started/)).toBeInTheDocument();
  });

  it('renders a finished ended run with a PR link and no diagnosis', async () => {
    vi.spyOn(defaultClient, 'getStartupLog').mockResolvedValue('[finish] opened PR #340 → main');

    renderDrawer({ kind: 'ended', view: ENDED_FINISHED });

    expect(screen.getByRole('heading', { name: 'CREW-227' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName('finished');
    expect(screen.getByRole('link', { name: /PR #340/ })).toHaveAttribute(
      'href',
      'https://example.com/pr/340',
    );
    expect(screen.queryByText('Diagnosis')).toBeNull();
    expect(await screen.findByText(/opened PR #340/)).toBeInTheDocument();
  });

  it('does not fetch the startup log while closed', () => {
    const spy = vi.spyOn(defaultClient, 'getStartupLog').mockResolvedValue('x');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    render(<RunDrawer source={{ kind: 'failed-start', view: FAILED }} open={false} onOpenChange={() => {}} />, {
      wrapper,
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
