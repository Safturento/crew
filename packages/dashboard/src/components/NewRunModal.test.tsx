import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NewRunModal } from './NewRunModal.js';
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
  const utils = render(
    <NewRunModal
      open
      onOpenChange={onOpenChange}
      projects={projects}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onConfirm, onOpenChange, ...utils };
}

describe('NewRunModal', () => {
  it('step 1 lists a selectable row per project', () => {
    renderModal();
    expect(screen.getByText('Pick a project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kanban-api/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /crew/ })).toBeInTheDocument();
  });

  it('selecting a project advances to the ticket step and surfaces its jira key', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /kanban-api/ }));
    expect(screen.getByText(/Pick a ticket/)).toBeInTheDocument();
    expect(screen.getByText(/KAN/)).toBeInTheDocument();
  });

  it('blocks advancing past the ticket step until a key is entered', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /kanban-api/ }));

    const next = screen.getByRole('button', { name: /Next/ });
    expect(next).toBeDisabled();

    await user.type(screen.getByLabelText(/ticket/i), 'KAN-23');
    expect(next).toBeEnabled();
  });

  it('confirm step shows the resolved run command and enqueues on Spawn', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal();

    await user.click(screen.getByRole('button', { name: /kanban-api/ }));
    await user.type(screen.getByLabelText(/ticket/i), 'KAN-23');
    await user.click(screen.getByRole('button', { name: /Next/ }));

    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('crew run KAN-23')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Spawn agent/ }));
    expect(onConfirm).toHaveBeenCalledWith({ project: 'kanban-api', ticketKey: 'KAN-23' });
  });

  it('Back steps the wizard backwards', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /kanban-api/ }));
    await user.type(screen.getByLabelText(/ticket/i), 'KAN-23');
    await user.click(screen.getByRole('button', { name: /Next/ }));

    expect(screen.getByText('Confirm')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByText(/Pick a ticket/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByText('Pick a project')).toBeInTheDocument();
  });

  it('resets to step 1 when reopened', async () => {
    const user = userEvent.setup();
    const { rerender } = renderModal();
    await user.click(screen.getByRole('button', { name: /kanban-api/ }));
    expect(screen.getByText(/Pick a ticket/)).toBeInTheDocument();

    // Close, then reopen — the wizard should be back on the project step.
    rerender(
      <NewRunModal open={false} onOpenChange={() => {}} projects={projects} onConfirm={() => {}} />,
    );
    rerender(<NewRunModal open onOpenChange={() => {}} projects={projects} onConfirm={() => {}} />);
    expect(screen.getByText('Pick a project')).toBeInTheDocument();
  });
});
