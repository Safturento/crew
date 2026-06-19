import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveProcess } from 'crew-shared';

import { ProcessRow } from './ProcessRow.js';

const base: LiveProcess = {
  agentKey: 'CREW-231',
  command: 'run',
  pid: 10,
  pgid: 10,
  actionRequestId: null,
  spawnedAt: new Date(Date.now() - 60_000).toISOString(),
  state: 'running',
  project: '~/code/crew',
};

function renderRow(
  p: Partial<LiveProcess> = {},
  handlers: Partial<{ onCancel: (key: string) => void; onForceKill: (key: string) => void }> = {},
) {
  const onCancel = vi.fn(handlers.onCancel);
  const onForceKill = vi.fn(handlers.onForceKill);
  render(<ProcessRow process={{ ...base, ...p }} onCancel={onCancel} onForceKill={onForceKill} />);
  return { onCancel, onForceKill };
}

describe('ProcessRow', () => {
  it('renders the agent key, command badge, project, and a running pill', () => {
    renderRow();
    expect(screen.getByText('CREW-231')).toBeInTheDocument();
    expect(screen.getByText('run')).toBeInTheDocument();
    expect(screen.getByText('~/code/crew')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName('running');
  });

  it('shows Pause (disabled) + Cancel for a running process', () => {
    renderRow({ state: 'running' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('shows only Cancel (no Pause) for a launching process', () => {
    renderRow({ state: 'launching' });
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName('launching');
  });

  it('shows the cancelling pill + Force kill immediately when the snapshot reports cancelling', () => {
    renderRow({ state: 'cancelling' });
    expect(screen.getByRole('status')).toHaveAccessibleName('cancelling');
    expect(screen.getByRole('button', { name: 'Force kill' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});

describe('ProcessRow cancel → soft cancel (real timers)', () => {
  it('Cancel opens a confirm; confirming soft-cancels and flips the row to cancelling', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderRow({ state: 'running' }, { onCancel });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel run' }));

    expect(onCancel).toHaveBeenCalledWith('CREW-231');
    expect(screen.getByRole('status')).toHaveAccessibleName('cancelling');
    // The escalation hasn't elapsed yet — no Force kill.
    expect(screen.queryByRole('button', { name: 'Force kill' })).toBeNull();
  });
});

describe('ProcessRow force-kill escalation (fake timers)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // Uses synchronous fireEvent + getByRole — testing-library's async findBy
  // polls on real timers, which fake timers freeze.
  it('reveals Force kill ~10s after confirming, wired to onForceKill', () => {
    const onForceKill = vi.fn();
    renderRow({ state: 'running' }, { onForceKill });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }));
    expect(screen.queryByRole('button', { name: 'Force kill' })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    const force = screen.getByRole('button', { name: 'Force kill' });
    fireEvent.click(force);
    expect(onForceKill).toHaveBeenCalledWith('CREW-231');
  });
});
