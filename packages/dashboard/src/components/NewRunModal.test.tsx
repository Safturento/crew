import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../test/renderWithProviders.js';
import { MockDaemonClient } from '../data/MockDaemonClient.js';
import { NewRunModal } from './NewRunModal.js';
import type { DaemonClient } from '../data/DaemonClient.js';
import type { Project } from '../data/types.js';

const projects: Project[] = [
  {
    name: 'kanban-api',
    repoPath: '~/code/kanban-api',
    branch: 'main',
    jiraKey: 'KAN',
    activeCount: 2,
  },
  { name: 'crew', repoPath: '~/code/crew', branch: 'main', jiraKey: 'CREW', activeCount: 1 },
];

function renderModal(overrides: Partial<React.ComponentProps<typeof NewRunModal>> = {}) {
  const onConfirm = overrides.onConfirm ?? vi.fn();
  const onOpenChange = overrides.onOpenChange ?? vi.fn();
  const client: DaemonClient = overrides.client ?? new MockDaemonClient();
  const utils = renderWithProviders(
    <NewRunModal
      open
      onOpenChange={onOpenChange}
      projects={projects}
      onConfirm={onConfirm}
      client={client}
      {...overrides}
    />,
  );
  return { onConfirm, onOpenChange, client, ...utils };
}

/** Open the modal and click into the first project to reach the ticket step. */
async function gotoStep2(overrides: Partial<React.ComponentProps<typeof NewRunModal>> = {}) {
  const user = userEvent.setup();
  const utils = renderModal(overrides);
  await user.click(screen.getByRole('button', { name: /kanban-api/ }));
  return { user, ...utils };
}

describe('NewRunModal', () => {
  it('step 1 lists a selectable row per project', () => {
    renderModal();
    expect(screen.getByText('Pick a project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kanban-api/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /crew/ })).toBeInTheDocument();
  });

  it('selecting a project advances to the ticket step and surfaces its jira key', async () => {
    await gotoStep2();
    expect(screen.getByText(/Pick a ticket/)).toBeInTheDocument();
    expect(screen.getByText(/KAN/)).toBeInTheDocument();
  });

  it('lists tickets grouped by epic with a search filter', async () => {
    const { user } = await gotoStep2();
    expect(await screen.findByText(/Sample Epic/)).toBeInTheDocument();
    expect(screen.getByText('CREW-101')).toBeInTheDocument();
    expect(screen.getByText('Runnable ticket')).toBeInTheDocument();
    // Ungrouped (parent-less) group header renders too.
    expect(screen.getByText('Ungrouped')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/filter/i), 'Blocked');
    expect(screen.queryByText('Runnable ticket')).not.toBeInTheDocument();
    expect(screen.getByText('Blocked ticket')).toBeInTheDocument();
  });

  it('disables blocked rows with a blocker hint and badges in-flight rows', async () => {
    await gotoStep2();
    const blocked = (await screen.findByText('Blocked ticket')).closest('button')!;
    expect(blocked).toBeDisabled();
    expect(screen.getByText(/blocked by CREW-1/i)).toBeInTheDocument();

    const inflight = screen.getByText('In-flight ticket').closest('button')!;
    expect(inflight).toBeDisabled();
    expect(screen.getByText(/running/i)).toBeInTheDocument();
  });

  it('renders priority badges for runnable rows', async () => {
    await gotoStep2();
    // CREW-101 is High priority.
    expect(await screen.findByText('High')).toBeInTheDocument();
    // CREW-104 (Ungrouped) is Low priority.
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('disables an interactive row with an "interactive" reason', async () => {
    await gotoStep2();
    const interactive = (await screen.findByText('Interactive ticket')).closest('button')!;
    expect(interactive).toBeDisabled();
    expect(screen.getByText('interactive')).toBeInTheDocument();
  });

  it('"Available only" hides blocked + in-flight + interactive tickets', async () => {
    const { user } = await gotoStep2();
    await screen.findByText('Runnable ticket');
    await user.click(screen.getByRole('switch'));
    expect(screen.queryByText('Blocked ticket')).not.toBeInTheDocument();
    expect(screen.queryByText('In-flight ticket')).not.toBeInTheDocument();
    expect(screen.queryByText('Interactive ticket')).not.toBeInTheDocument();
    expect(screen.getByText('Runnable ticket')).toBeInTheDocument();
  });

  it('selecting a ticket shows its title + command on the confirm step', async () => {
    const { user } = await gotoStep2();
    await user.click(await screen.findByText('Runnable ticket'));
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('crew run CREW-101')).toBeInTheDocument();
    // Title row carries the ticket summary.
    expect(screen.getByText('Runnable ticket')).toBeInTheDocument();
  });

  it('enqueues the selected ticket on Spawn', async () => {
    const { user, onConfirm } = await gotoStep2();
    await user.click(await screen.findByText('Runnable ticket'));
    await user.click(screen.getByRole('button', { name: /Spawn agent/ }));
    expect(onConfirm).toHaveBeenCalledWith({ project: 'kanban-api', ticketKey: 'CREW-101' });
  });

  describe('degraded fallback', () => {
    function degradedClient(): DaemonClient {
      const client = new MockDaemonClient();
      client.listProjectTickets = async () => ({ available: false, reason: 'no_credentials' });
      return client;
    }

    it('degrades to manual ticket-key entry when the list is unavailable', async () => {
      await gotoStep2({ client: degradedClient() });
      expect(await screen.findByText(/live ticket list unavailable/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/ticket key/i)).toBeInTheDocument();
    });

    it('blocks Next until a key is entered, then reaches confirm', async () => {
      const { user } = await gotoStep2({ client: degradedClient() });
      const next = await screen.findByRole('button', { name: /Next/ });
      expect(next).toBeDisabled();
      await user.type(screen.getByLabelText(/ticket key/i), 'KAN-23');
      expect(next).toBeEnabled();
      await user.click(next);
      expect(screen.getByText('crew run KAN-23')).toBeInTheDocument();
    });

    it('degrades when the fetch errors', async () => {
      const client = new MockDaemonClient();
      client.listProjectTickets = async () => {
        throw new Error('boom');
      };
      await gotoStep2({ client });
      expect(await screen.findByText(/live ticket list unavailable/i)).toBeInTheDocument();
    });

    // Regression: the production QueryClient sets `throwOnError: true`, so a
    // ticket-fetch error would crash the whole dashboard to its error boundary
    // instead of degrading the modal — unless the query opts out. Reproduce the
    // production config here so the degrade path is actually exercised.
    it('degrades (does not throw to the error boundary) under throwOnError', async () => {
      const user = userEvent.setup();
      const client = new MockDaemonClient();
      client.listProjectTickets = async () => {
        throw new Error('GET /api/projects/recipes/tickets: 404');
      };
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, throwOnError: true } },
      });
      renderWithProviders(
        <NewRunModal
          open
          onOpenChange={() => {}}
          projects={projects}
          onConfirm={() => {}}
          client={client}
        />,
        { queryClient },
      );
      await user.click(screen.getByRole('button', { name: /kanban-api/ }));
      expect(await screen.findByText(/live ticket list unavailable/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/ticket key/i)).toBeInTheDocument();
    });
  });

  it('Back steps the wizard backwards', async () => {
    const { user } = await gotoStep2();
    await user.click(await screen.findByText('Runnable ticket'));
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByText(/Pick a ticket/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByText('Pick a project')).toBeInTheDocument();
  });

  it('resets to step 1 when reopened', async () => {
    const u = userEvent.setup();
    const { rerender, client } = renderModal();
    await u.click(screen.getByRole('button', { name: /kanban-api/ }));
    expect(screen.getByText(/Pick a ticket/)).toBeInTheDocument();

    rerender(
      <NewRunModal
        open={false}
        onOpenChange={() => {}}
        projects={projects}
        onConfirm={() => {}}
        client={client}
      />,
    );
    rerender(
      <NewRunModal
        open
        onOpenChange={() => {}}
        projects={projects}
        onConfirm={() => {}}
        client={client}
      />,
    );
    expect(screen.getByText('Pick a project')).toBeInTheDocument();
  });
});
