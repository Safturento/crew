import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SupervisorDrawer } from './SupervisorDrawer.js';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { defaultClient } from '../../data/queries.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const LINES = [
  '2026-06-27 14:39:02 runner started (pid 48213)',
  '2026-06-27 14:41:58 worker exited 137; respawning CREW-231',
  '2026-06-27 14:42:30 reaped 1 dead process(es)',
];

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
      <SupervisorDrawer supervisor={{ online: false, lastSeen: null }} open onOpenChange={() => {}} />,
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
