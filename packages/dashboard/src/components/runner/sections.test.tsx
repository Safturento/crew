import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunFailure } from 'crew-shared';

import { SupervisorCard } from './SupervisorCard.js';
import { FailedToStartSection } from './FailedToStartSection.js';
import { LiveProcessList } from './LiveProcessList.js';
import { UnmanagedRuns } from './UnmanagedRuns.js';
import { QueuedActions } from './QueuedActions.js';
import { RecentlyEnded } from './RecentlyEnded.js';
import { renderWithProviders as render } from '@/test/renderWithProviders';
import { defaultClient } from '@/data/queries';
import type { EndedRunView, FailedStartView } from './types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('renders down + a disabled "Runner offline" Start when no handler is wired', () => {
    render(<SupervisorCard supervisor={{ online: false, lastSeen: null }} />);
    expect(screen.getByRole('status')).toHaveAccessibleName('down');
    const start = screen.getByRole('button', { name: 'Start' });
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute('title', 'Runner offline');
  });

  it('fires onRestart / onStop when online and the handlers are wired', async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();
    const onStop = vi.fn();
    render(
      <SupervisorCard
        supervisor={{ online: true, lastSeen: Date.now() }}
        onRestart={onRestart}
        onStop={onStop}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('fires onStart (the cold-Start CLI hint) when offline and wired', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<SupervisorCard supervisor={{ online: false, lastSeen: null }} onStart={onStart} />);
    const start = screen.getByRole('button', { name: 'Start' });
    expect(start).toBeEnabled();
    await user.click(start);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('opens the supervisor drawer when the card is clicked', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <SupervisorCard
        supervisor={{ online: true, lastSeen: Date.now() }}
        onOpen={onOpen}
        onRestart={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open supervisor detail' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('does not open the drawer when an action button is clicked', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onRestart = vi.fn();
    render(
      <SupervisorCard
        supervisor={{ online: true, lastSeen: Date.now() }}
        onOpen={onOpen}
        onRestart={onRestart}
        onStop={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('LiveProcessList', () => {
  it('renders a muted empty row when there are no processes', () => {
    render(
      <LiveProcessList
        processes={[]}
        onCancel={vi.fn()}
        onForceKill={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
      />,
    );
    expect(screen.getByText('No agents currently running')).toBeInTheDocument();
  });

  it('renders skeleton rows while loading', () => {
    render(
      <LiveProcessList
        processes={[]}
        loading
        onCancel={vi.fn()}
        onForceKill={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
      />,
    );
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

  it('Inspect opens the run drawer with the diagnosis + console (CREW-291)', async () => {
    vi.spyOn(defaultClient, 'getStartupLog').mockResolvedValue(null);
    const user = userEvent.setup();
    render(<FailedToStartSection failures={[failure]} onArchive={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Inspect' }));
    // The drawer's Diagnosis carries the structured check name; the console
    // falls back to failure.output when no startup log was captured.
    expect(await screen.findByText('remote-repo-resolves')).toBeInTheDocument();
    expect(screen.getByText(/process exited 1/)).toBeInTheDocument();
  });

  it('clicking the row opens the run drawer (CREW-291)', async () => {
    vi.spyOn(defaultClient, 'getStartupLog').mockResolvedValue(null);
    const user = userEvent.setup();
    render(<FailedToStartSection failures={[failure]} onArchive={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Open run drawer for CREW-241' }));
    expect(await screen.findByText('remote-repo-resolves')).toBeInTheDocument();
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

  it('renders a cancelled run with no right-side action, but the row opens the drawer', () => {
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
    // No PR link and no secondary action; the only interactive element is the
    // clickable row itself (CREW-291).
    expect(screen.queryByRole('link')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Open run drawer for CREW-219' }),
    ).toBeInTheDocument();
  });

  it('clicking an error run row opens the drawer with its diagnosis (CREW-291)', async () => {
    vi.spyOn(defaultClient, 'getStartupLog').mockResolvedValue(null);
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
    await user.click(screen.getByRole('button', { name: 'Open run drawer for CREW-217' }));
    expect(await screen.findByText('remote-repo-resolves')).toBeInTheDocument();
  });
});
