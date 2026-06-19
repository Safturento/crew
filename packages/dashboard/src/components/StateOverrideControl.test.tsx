import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StateOverrideControl } from './StateOverrideControl.js';

import type * as QueriesModule from '../data/queries.js';

vi.mock('../data/queries.js', async (importOriginal) => {
  const actual = await importOriginal<typeof QueriesModule>();
  return {
    ...actual,
    useOverrideState: vi.fn(),
  };
});
import { useOverrideState } from '../data/queries.js';
const mockedUseOverrideState = vi.mocked(useOverrideState);

function makeMutation(overrides: Partial<{ isPending: boolean; mutate: () => void }> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    data: undefined,
    error: null,
    reset: vi.fn(),
    variables: undefined,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    status: 'idle',
    submittedAt: 0,
    context: undefined,
    ...overrides,
  } as never;
}

afterEach(() => {
  mockedUseOverrideState.mockReset();
});

describe('StateOverrideControl (CREW-260)', () => {
  beforeEach(() => {
    mockedUseOverrideState.mockReturnValue(makeMutation());
  });

  it('opens the popover listing all 8 states with the current one disabled', async () => {
    render(<StateOverrideControl agentKey="CREW-1" state="running" />);
    await userEvent.click(screen.getByRole('button', { name: /override state/i }));

    for (const label of [
      'Waiting',
      'Error',
      'PR open',
      'PR merged',
      'Running',
      'Starting',
      'Idle',
      'Finished',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // The agent's current state is offered but not selectable.
    expect(screen.getByRole('menuitem', { name: /running/i })).toBeDisabled();
  });

  it('selecting a state opens a confirm modal whose Override button fires the mutation', async () => {
    const mutate = vi.fn();
    mockedUseOverrideState.mockReturnValue(makeMutation({ mutate }));

    render(<StateOverrideControl agentKey="CREW-1" state="running" />);
    await userEvent.click(screen.getByRole('button', { name: /override state/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Finished' }));

    // AlertModal names both the source and target state.
    expect(screen.getByText(/running/i)).toBeInTheDocument();
    expect(screen.getByText(/finished/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Override' }));
    expect(mutate).toHaveBeenCalledWith('finished');
  });

  it('cancelling the confirm modal does not fire the mutation', async () => {
    const mutate = vi.fn();
    mockedUseOverrideState.mockReturnValue(makeMutation({ mutate }));

    render(<StateOverrideControl agentKey="CREW-1" state="running" />);
    await userEvent.click(screen.getByRole('button', { name: /override state/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Finished' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mutate).not.toHaveBeenCalled();
  });

  it('clicking the current state does not open the confirm modal', async () => {
    render(<StateOverrideControl agentKey="CREW-1" state="running" />);
    await userEvent.click(screen.getByRole('button', { name: /override state/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /running/i }));

    expect(screen.queryByRole('button', { name: 'Override' })).not.toBeInTheDocument();
  });
});
