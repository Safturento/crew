import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RunFailure } from 'crew-shared';

import { SupervisorCard } from './SupervisorCard.js';
import { FailedToStartSection } from './FailedToStartSection.js';
import { LiveProcessList } from './LiveProcessList.js';
import { UnmanagedRuns } from './UnmanagedRuns.js';
import { QueuedActions } from './QueuedActions.js';
import { RecentlyEnded } from './RecentlyEnded.js';
import type { EndedRunView, FailedStartView } from './types.js';

const FAILURE: RunFailure = {
  check: 'remote-repo-resolves',
  headline: "Remote 'origin' not found in project config",
  remediation: 'set repo.remote in crew.toml',
  output: '$ crew run CREW-241\npreflight: remote-repo-resolves\nprocess exited 1',
};

describe('SupervisorCard', () => {
  it('shows a running pill + Restart/Stop when online', () => {
    render(<SupervisorCard supervisor={{ online: true, lastSeen: Date.now() }} />);
    expect(screen.getByRole('status')).toHaveAccessibleName('running');
    expect(screen.getByText('Supervisor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('renders down + a disabled "Runner offline" Start when offline', () => {
    render(<SupervisorCard supervisor={{ online: false, lastSeen: null }} />);
    expect(screen.getByRole('status')).toHaveAccessibleName('down');
    const start = screen.getByRole('button', { name: 'Start' });
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute('title', 'Runner offline');
  });
});

describe('LiveProcessList', () => {
  it('renders a muted empty row when there are no processes', () => {
    render(<LiveProcessList processes={[]} onCancel={vi.fn()} onForceKill={vi.fn()} />);
    expect(screen.getByText('No agents currently running')).toBeInTheDocument();
  });

  it('renders skeleton rows while loading', () => {
    render(<LiveProcessList processes={[]} loading onCancel={vi.fn()} onForceKill={vi.fn()} />);
    expect(screen.getAllByTestId('skeleton-row').length).toBeGreaterThan(0);
    expect(screen.queryByText('No agents currently running')).toBeNull();
  });
});

describe('FailedToStartSection', () => {
  const failure: FailedStartView = {
    key: 'CREW-241',
    command: 'run',
    project: '~/code/crew',
    failedAt: new Date(Date.now() - 120_000).toISOString(),
    failure: FAILURE,
  };

  it('is hidden entirely when empty', () => {
    const { container } = render(<FailedToStartSection failures={[]} onArchive={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a card with the headline + remediation and fires Archive', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(<FailedToStartSection failures={[failure]} onArchive={onArchive} />);
    expect(screen.getByText('Failed to start')).toBeInTheDocument();
    expect(screen.getByText("Remote 'origin' not found in project config")).toBeInTheDocument();
    expect(screen.getByText('→ set repo.remote in crew.toml')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalledWith('CREW-241');
  });

  it('Inspect opens the Diagnosis + Output modal', async () => {
    const user = userEvent.setup();
    render(<FailedToStartSection failures={[failure]} onArchive={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Inspect' }));
    expect(await screen.findByText('Startup output — CREW-241')).toBeInTheDocument();
    expect(screen.getByText('remote-repo-resolves')).toBeInTheDocument();
    expect(screen.getByText(/process exited 1/)).toBeInTheDocument();
  });
});

describe('UnmanagedRuns', () => {
  it('is hidden when empty', () => {
    const { container } = render(<UnmanagedRuns runs={[]} onReap={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an amber-accented row and fires Reap', async () => {
    const user = userEvent.setup();
    const onReap = vi.fn();
    render(
      <UnmanagedRuns
        runs={[{ key: 'CREW-228', project: '~/code/crew', startedAt: new Date().toISOString() }]}
        onReap={onReap}
      />,
    );
    expect(screen.getByText('CREW-228')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reap' }));
    expect(onReap).toHaveBeenCalledWith('CREW-228');
  });

  it('carries the shared waiting accent', () => {
    render(
      <UnmanagedRuns
        runs={[{ key: 'CREW-228', project: '~/code/crew', startedAt: new Date().toISOString() }]}
        onReap={vi.fn()}
      />,
    );
    const row = screen.getByText('CREW-228').closest('[data-attention]');
    expect(row).toHaveAttribute('data-attention', 'waiting');
  });
});

describe('QueuedActions', () => {
  it('is hidden when empty', () => {
    const { container } = render(<QueuedActions actions={[]} onDequeue={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a queued row and fires Dequeue', async () => {
    const user = userEvent.setup();
    const onDequeue = vi.fn();
    render(
      <QueuedActions
        actions={[
          {
            key: 'CREW-240',
            command: 'run',
            project: '~/code/crew',
            queuedAt: new Date().toISOString(),
          },
        ]}
        onDequeue={onDequeue}
      />,
    );
    expect(screen.getByRole('status')).toHaveAccessibleName('queued');
    await user.click(screen.getByRole('button', { name: 'Dequeue' }));
    expect(onDequeue).toHaveBeenCalledWith('CREW-240');
  });
});

describe('RecentlyEnded', () => {
  it('shows a muted empty state when nothing has ended', () => {
    render(<RecentlyEnded runs={[]} />);
    expect(screen.getByText('Nothing ended recently')).toBeInTheDocument();
  });

  it('renders a finished run with a PR link', () => {
    const runs: EndedRunView[] = [
      {
        key: 'CREW-227',
        command: 'run',
        project: '~/code/crew',
        endedAt: new Date().toISOString(),
        kind: 'finished',
        prNumber: 340,
        prUrl: 'https://example.com/pr/340',
      },
    ];
    render(<RecentlyEnded runs={runs} />);
    expect(screen.getByRole('link', { name: /PR #340/ })).toHaveAttribute(
      'href',
      'https://example.com/pr/340',
    );
  });

  it('renders a cancelled run with no right-side action', () => {
    const runs: EndedRunView[] = [
      {
        key: 'CREW-219',
        command: 'fix-pr',
        project: '~/code/crew',
        endedAt: new Date().toISOString(),
        kind: 'cancelled',
      },
    ];
    render(<RecentlyEnded runs={runs} />);
    expect(screen.getByText('soft cancel')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders an error run with an Inspect that opens the modal', async () => {
    const user = userEvent.setup();
    const runs: EndedRunView[] = [
      {
        key: 'CREW-217',
        command: 'run',
        project: '~/code/crew',
        endedAt: new Date().toISOString(),
        kind: 'error',
        failure: FAILURE,
      },
    ];
    render(<RecentlyEnded runs={runs} />);
    await user.click(screen.getByRole('button', { name: 'Inspect' }));
    expect(await screen.findByText('Startup output — CREW-217')).toBeInTheDocument();
  });
});
