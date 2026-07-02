import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReconcileRollup } from 'crew-shared';

import { SupervisorDrawer } from './SupervisorDrawer.js';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { defaultClient } from '../../data/queries.js';

beforeEach(() => {
  // The drawer now internally pulls the reconcile roll-up and enqueues runner
  // commands (Controls + Reconcile section). Default both to inert so the
  // log-focused tests below don't hit the network; the reconcile/controls
  // tests override `reconcile` with a populated payload.
  vi.spyOn(defaultClient, 'reconcile').mockResolvedValue({ queued: [], orphaned: [] });
  vi.spyOn(defaultClient, 'enqueueRunnerCommand').mockResolvedValue({
    id: 1,
    agentKey: null,
    kind: 'reap',
    payload: null,
    status: 'pending',
    error: null,
    createdAt: '2026-06-27T14:42:30.000Z',
    updatedAt: '2026-06-27T14:42:30.000Z',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const LINES = [
  '2026-06-27 14:39:02 runner started (pid 48213)',
  '2026-06-27 14:41:58 worker exited 137; respawning CREW-231',
  '2026-06-27 14:42:30 reaped 1 dead process(es)',
];

const ROLLUP: ReconcileRollup = {
  queued: [
    { key: 'CREW-9', projectName: 'crew', state: 'queued', since: '2026-06-27T14:30:00.000Z' },
  ],
  orphaned: [
    { key: 'CREW-11', projectName: 'crew', state: 'orphaned', since: '2026-06-27T14:20:00.000Z' },
  ],
};

describe('SupervisorDrawer', () => {
  it('tails the supervisor management log and renders its lines', async () => {
    vi.spyOn(defaultClient, 'getSupervisorLog').mockResolvedValue(LINES);

    renderWithProviders(
      <SupervisorDrawer
        supervisor={{ online: true, lastSeen: Date.now() }}
        open
        onOpenChange={() => {}}
      />,
    );

    // Header identity + a running status badge.
    expect(screen.getByRole('heading', { name: 'Supervisor' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName('running');

    // The management log section + its tailed lines.
    expect(screen.getByText('Management log')).toBeInTheDocument();
    expect(await screen.findByText(/worker exited 137; respawning CREW-231/)).toBeInTheDocument();
    expect(screen.getByText(/reaped 1 dead process/)).toBeInTheDocument();
  });

  it('renders a down badge and an empty state when offline with no log', async () => {
    vi.spyOn(defaultClient, 'getSupervisorLog').mockResolvedValue([]);

    renderWithProviders(
      <SupervisorDrawer
        supervisor={{ online: false, lastSeen: null }}
        open
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByRole('status')).toHaveAccessibleName('down');
    expect(
      await screen.findByText(/no runner is running here|no management log/i),
    ).toBeInTheDocument();
  });

  it('copies the log to the clipboard', async () => {
    vi.spyOn(defaultClient, 'getSupervisorLog').mockResolvedValue(LINES);
    const user = userEvent.setup();
    // Install our clipboard stub *after* userEvent.setup() — it installs its
    // own clipboard mock, and the component reads navigator.clipboard lazily at
    // click time, so the last assignment wins.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderWithProviders(
      <SupervisorDrawer
        supervisor={{ online: true, lastSeen: Date.now() }}
        open
        onOpenChange={() => {}}
      />,
    );

    await screen.findByText(/reaped 1 dead process/);
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINES.join('\n')));
  });

  it('shows Restart + Stop supervisor controls while online', async () => {
    vi.spyOn(defaultClient, 'getSupervisorLog').mockResolvedValue(LINES);
    const user = userEvent.setup();

    renderWithProviders(
      <SupervisorDrawer
        supervisor={{ online: true, lastSeen: Date.now() }}
        open
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: /restart supervisor/i }));
    expect(defaultClient.enqueueRunnerCommand).toHaveBeenCalledWith({
      agentKey: null,
      kind: 'supervisor_restart',
      payload: null,
    });

    await user.click(screen.getByRole('button', { name: /stop supervisor/i }));
    expect(defaultClient.enqueueRunnerCommand).toHaveBeenCalledWith({
      agentKey: null,
      kind: 'supervisor_stop',
      payload: null,
    });
  });

  it('renders the reconcile roll-up with Dequeue for queued and Reap for orphaned runs', async () => {
    vi.spyOn(defaultClient, 'getSupervisorLog').mockResolvedValue(LINES);
    vi.spyOn(defaultClient, 'reconcile').mockResolvedValue(ROLLUP);
    const user = userEvent.setup();

    renderWithProviders(
      <SupervisorDrawer
        supervisor={{ online: true, lastSeen: Date.now() }}
        open
        onOpenChange={() => {}}
      />,
    );

    // Both housekeeping refs surface with their keys.
    expect(await screen.findByText('CREW-9')).toBeInTheDocument();
    expect(screen.getByText('CREW-11')).toBeInTheDocument();

    // The queued ref dequeues; the orphaned ref reaps.
    await user.click(screen.getByRole('button', { name: /dequeue CREW-9/i }));
    expect(defaultClient.enqueueRunnerCommand).toHaveBeenCalledWith({
      agentKey: 'CREW-9',
      kind: 'dequeue',
      payload: null,
    });

    await user.click(screen.getByRole('button', { name: /reap CREW-11/i }));
    expect(defaultClient.enqueueRunnerCommand).toHaveBeenCalledWith({
      agentKey: 'CREW-11',
      kind: 'reap',
      payload: null,
    });
  });

  it('renders an empty reconcile state when nothing is queued or orphaned', async () => {
    vi.spyOn(defaultClient, 'getSupervisorLog').mockResolvedValue(LINES);
    vi.spyOn(defaultClient, 'reconcile').mockResolvedValue({ queued: [], orphaned: [] });

    renderWithProviders(
      <SupervisorDrawer
        supervisor={{ online: true, lastSeen: Date.now() }}
        open
        onOpenChange={() => {}}
      />,
    );

    expect(await screen.findByText(/nothing to reconcile/i)).toBeInTheDocument();
  });

  it('closes via the close button', async () => {
    vi.spyOn(defaultClient, 'getSupervisorLog').mockResolvedValue([]);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <SupervisorDrawer
        supervisor={{ online: true, lastSeen: Date.now() }}
        open
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
