import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentRow } from './AgentRow.js';
import type { Agent, AgentState } from '@/data/types';

const baseAgent: Agent = {
  key: 'KAN-31',
  projectName: 'kanban-api',
  ticketTitle: 'Add board archival endpoint',
  state: 'waiting',
  startedAt: new Date(Date.now() - 33 * 60_000 - 4_000).toISOString(),
  tokens: 48_240,
};

describe('AgentRow', () => {
  it('renders the ticket key, title, runtime, and tokens', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByText('KAN-31')).toBeInTheDocument();
    expect(screen.getByText(/Add board archival endpoint/)).toBeInTheDocument();
    expect(screen.getByText(/^33m 0[34]s$/)).toBeInTheDocument();
    expect(screen.getByText('48.2k')).toBeInTheDocument();
  });

  it('renders the state badge', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Waiting');
  });

  it('renders meta-row icons (Hash, Clock, Currency) alongside the key, runtime, and tokens', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    const row = screen.getByRole('button', { name: /KAN-31/ });
    const svgs = row.querySelectorAll('svg');
    // 1 (state pill Circle) + 3 (meta-row Hash/Clock/Currency) = 4 minimum
    expect(svgs.length).toBeGreaterThanOrEqual(4);
  });

  it('truncates the ticket title and keeps the meta row visible alongside it', () => {
    const longTitle = 'A'.repeat(200);
    render(<AgentRow agent={{ ...baseAgent, ticketTitle: longTitle }} onSelect={() => {}} />);
    const title = screen.getByText(longTitle);
    expect(title.className).toContain('truncate');
    expect(screen.getByText('KAN-31')).toBeInTheDocument();
    expect(screen.getByText('48.2k')).toBeInTheDocument();
  });

  it('renders quick-action buttons at sm size (not xs)', () => {
    render(<AgentRow agent={{ ...baseAgent, state: 'idle' }} onSelect={() => {}} />);
    const resume = screen.getByRole('button', { name: 'Resume' });
    // Button primitive maps xs→h-6 and sm→h-8 (see ui/button.tsx).
    expect(resume.className).not.toMatch(/\bh-6\b/);
    expect(resume.className).toMatch(/\bh-8\b/);
  });

  it('renders a "Provide input" quick action for waiting state', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Provide input' })).toBeInTheDocument();
  });

  it('renders "View PR" + "Fix PR" + "Finish" quick actions for pr_open state', () => {
    render(
      <AgentRow
        agent={{ ...baseAgent, state: 'pr_open', prUrl: 'https://example.com/pr/1' }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('link', { name: /View PR/ })).toHaveAttribute(
      'href',
      'https://example.com/pr/1',
    );
    expect(screen.getByRole('button', { name: 'Fix PR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
  });

  // CREW-219: Fix PR is exclusive to pr_open — it opens the comment modal that
  // enqueues a fix_pr action. It must not leak into any other state.
  it('forwards a "fix-pr" onAction event for pr_open', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <AgentRow
        agent={{ ...baseAgent, state: 'pr_open', prUrl: 'https://example.com/pr/1' }}
        onSelect={() => {}}
        onAction={onAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Fix PR' }));
    expect(onAction).toHaveBeenCalledWith('fix-pr', expect.objectContaining({ key: 'KAN-31' }));
  });

  it('only shows Fix PR for pr_open (not pr_merged, idle, or waiting)', () => {
    for (const state of ['pr_merged', 'idle', 'waiting'] as AgentState[]) {
      const { unmount } = render(
        <AgentRow
          agent={{ ...baseAgent, state, prUrl: 'https://example.com/pr/1' }}
          onSelect={() => {}}
        />,
      );
      expect(screen.queryByRole('button', { name: 'Fix PR' })).not.toBeInTheDocument();
      unmount();
    }
  });

  // CREW-217 gate: Fix PR enqueues runner work, so it degrades to disabled
  // when no runner is connected, same as Resume/Finish.
  it('disables Fix PR when the runner is offline', () => {
    render(
      <AgentRow
        agent={{ ...baseAgent, state: 'pr_open', prUrl: 'https://example.com/pr/1' }}
        onSelect={() => {}}
        runnerOnline={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Fix PR' })).toBeDisabled();
  });

  // CREW-202: pr_merged replaces the "View PR" pill with "View merged PR"
  // (lucide git-merge icon) so the user knows the PR is done. Finish stays
  // actionable as the next user step.
  it('renders "View merged PR" + "Finish" quick actions for pr_merged state', () => {
    render(
      <AgentRow
        agent={{ ...baseAgent, state: 'pr_merged', prUrl: 'https://example.com/pr/9' }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('link', { name: /View merged PR/ })).toHaveAttribute(
      'href',
      'https://example.com/pr/9',
    );
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
  });

  it('the pr_merged "View merged PR" pill uses the lucide git-merge icon', () => {
    render(
      <AgentRow
        agent={{ ...baseAgent, state: 'pr_merged', prUrl: 'https://example.com/pr/9' }}
        onSelect={() => {}}
      />,
    );
    const link = screen.getByRole('link', { name: /View merged PR/ });
    expect(link.querySelector('svg')?.classList.toString()).toMatch(/lucide-git-merge/);
  });

  // CREW-220: Finish does post-merge cleanup, so it is only actionable once
  // the PR is merged. On every other state it renders disabled + annotated.
  it('disables Finish until the agent reaches pr_merged', () => {
    for (const state of ['idle', 'pr_open'] as AgentState[]) {
      const { unmount } = render(
        <AgentRow
          agent={{ ...baseAgent, state, prUrl: 'https://example.com/pr/1' }}
          onSelect={() => {}}
        />,
      );
      const finish = screen.getByRole('button', { name: 'Finish' });
      expect(finish).toBeDisabled();
      expect(finish).toHaveAttribute('title', expect.stringMatching(/merged/i));
      unmount();
    }
  });

  it('enables Finish on pr_merged when a runner is online', () => {
    render(
      <AgentRow
        agent={{ ...baseAgent, state: 'pr_merged', prUrl: 'https://example.com/pr/9' }}
        onSelect={() => {}}
        runnerOnline
      />,
    );
    expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled();
  });

  it('renders "Resume" + "Finish" quick actions for idle state', () => {
    render(<AgentRow agent={{ ...baseAgent, state: 'idle' }} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
  });

  it('renders no quick action for running/initializing/finished', () => {
    for (const state of ['running', 'initializing', 'finished'] as AgentState[]) {
      const { unmount } = render(<AgentRow agent={{ ...baseAgent, state }} onSelect={() => {}} />);
      expect(
        screen.queryByRole('button', {
          name: /Provide input|Inspect|Resume|Finish|Archive/,
        }),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it('fires onSelect when the row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AgentRow agent={baseAgent} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /KAN-31/ }));
    expect(onSelect).toHaveBeenCalledWith('KAN-31');
  });

  it('does not fire onSelect when the quick action is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AgentRow agent={baseAgent} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'Provide input' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not fire onSelect when Enter is pressed on the quick action', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AgentRow agent={baseAgent} onSelect={onSelect} />);
    const action = screen.getByRole('button', { name: 'Provide input' });
    action.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks the row with attention data attribute for tinting', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /KAN-31/ })).toHaveAttribute(
      'data-attention',
      'waiting',
    );
  });

  it('renders "Resume" + "Inspect" quick actions for a mid-run error', () => {
    render(<AgentRow agent={{ ...baseAgent, state: 'error' }} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inspect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restart' })).not.toBeInTheDocument();
  });

  // CREW-311: a failed-start error never registered a run (the daemon serves
  // startedAt: ''), so there is no session to Resume — the recovery verb is
  // Restart (a fresh `run`; CREW-309 preflight reclaims the orphan worktree).
  describe('failed-start error rows (CREW-311)', () => {
    const failedStart: Agent = { ...baseAgent, state: 'error', startedAt: '' };

    it('renders "Restart" + "Inspect" instead of Resume', () => {
      render(<AgentRow agent={failedStart} onSelect={() => {}} />);
      expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Inspect' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
    });

    it('forwards a restart action', async () => {
      const user = userEvent.setup();
      const onAction = vi.fn();
      render(<AgentRow agent={failedStart} onSelect={() => {}} onAction={onAction} />);
      await user.click(screen.getByRole('button', { name: 'Restart' }));
      expect(onAction).toHaveBeenCalledWith('restart', expect.objectContaining({ key: 'KAN-31' }));
    });

    it('disables Restart when the runner is offline', () => {
      render(<AgentRow agent={failedStart} onSelect={() => {}} runnerOnline={false} />);
      expect(screen.getByRole('button', { name: 'Restart' })).toBeDisabled();
    });

    it('shows an em-dash runtime instead of a NaN duration', () => {
      render(<AgentRow agent={failedStart} onSelect={() => {}} />);
      expect(screen.getByText('—')).toBeInTheDocument();
      expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    });
  });

  // CREW-311: queued rows carry a single ghost Dequeue (drop the pending
  // action before the runner spawns it).
  describe('queued rows (CREW-311)', () => {
    const queued: Agent = { ...baseAgent, state: 'queued', startedAt: '' };

    it('renders a single Dequeue quick action', () => {
      render(<AgentRow agent={queued} onSelect={() => {}} />);
      const dequeue = screen.getByRole('button', { name: 'Dequeue' });
      expect(dequeue).toBeInTheDocument();
      expect(dequeue.parentElement).not.toHaveAttribute('data-qa-group');
    });

    it('forwards a dequeue action', async () => {
      const user = userEvent.setup();
      const onAction = vi.fn();
      render(<AgentRow agent={queued} onSelect={() => {}} onAction={onAction} />);
      await user.click(screen.getByRole('button', { name: 'Dequeue' }));
      expect(onAction).toHaveBeenCalledWith('dequeue', expect.objectContaining({ key: 'KAN-31' }));
    });
  });

  // CREW-311: orphaned rows carry a single Reap (force-settle the DB/process
  // mismatch).
  describe('orphaned rows (CREW-311)', () => {
    const orphaned: Agent = { ...baseAgent, state: 'orphaned' };

    it('renders a single Reap quick action', () => {
      render(<AgentRow agent={orphaned} onSelect={() => {}} />);
      expect(screen.getByRole('button', { name: 'Reap' })).toBeInTheDocument();
    });

    it('forwards a reap action', async () => {
      const user = userEvent.setup();
      const onAction = vi.fn();
      render(<AgentRow agent={orphaned} onSelect={() => {}} onAction={onAction} />);
      await user.click(screen.getByRole('button', { name: 'Reap' }));
      expect(onAction).toHaveBeenCalledWith('reap', expect.objectContaining({ key: 'KAN-31' }));
    });
  });

  // The error-state Resume re-enters the preserved worktree via crew resume, so
  // it drains through the host runner and degrades to disabled when offline.
  it('disables the error-state Resume when the runner is offline', () => {
    render(
      <AgentRow agent={{ ...baseAgent, state: 'error' }} onSelect={() => {}} runnerOnline={false} />,
    );
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled();
  });

  it('forwards a resume action from the error state', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <AgentRow agent={{ ...baseAgent, state: 'error' }} onSelect={() => {}} onAction={onAction} />,
    );
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onAction).toHaveBeenCalledWith('resume', expect.objectContaining({ key: 'KAN-31' }));
  });

  it('forwards onAction events with kind + agent', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <AgentRow agent={{ ...baseAgent, state: 'idle' }} onSelect={() => {}} onAction={onAction} />,
    );
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onAction).toHaveBeenCalledWith('resume', expect.objectContaining({ key: 'KAN-31' }));
  });

  const ATTENTION_TOKENS: Array<[AgentState, string, string]> = [
    ['waiting', 'border-amber-500', 'bg-amber-1050'],
    ['error', 'border-red-500', 'bg-red-1050'],
    ['pr_open', 'border-violet-500', 'bg-violet-1050'],
    ['orphaned', 'border-amber-500', 'bg-amber-1050'],
  ];

  it.each(ATTENTION_TOKENS)(
    'tints the row with literal STATE_CLASSES tokens for %s',
    (state, borderToken, bgToken) => {
      render(<AgentRow agent={{ ...baseAgent, state }} onSelect={() => {}} />);
      const row = screen.getByRole('button', { name: /KAN-31/ });
      expect(row.className).toContain(borderToken);
      expect(row.className).toContain(bgToken);
    },
  );

  const NON_ATTENTION_STATES: AgentState[] = [
    'initializing',
    'queued',
    'running',
    'idle',
    'finished',
  ];

  it.each(NON_ATTENTION_STATES)('uses neutral border for non-attention state %s', (state) => {
    render(<AgentRow agent={{ ...baseAgent, state }} onSelect={() => {}} />);
    const row = screen.getByRole('button', { name: /KAN-31/ });
    expect(row.className).toContain('border-white/10');
  });

  it('renders a qa-group wrapper when the state has two quick actions', () => {
    render(<AgentRow agent={{ ...baseAgent, state: 'idle' }} onSelect={() => {}} />);
    const resume = screen.getByRole('button', { name: 'Resume' });
    const finish = screen.getByRole('button', { name: 'Finish' });
    expect(resume.parentElement).toBe(finish.parentElement);
    expect(resume.parentElement).toHaveAttribute('data-qa-group', 'true');
  });

  it('does not render a qa-group wrapper for single-action states', () => {
    render(<AgentRow agent={{ ...baseAgent, state: 'waiting' }} onSelect={() => {}} />);
    const button = screen.getByRole('button', { name: 'Provide input' });
    expect(button.parentElement).not.toHaveAttribute('data-qa-group');
  });

  it('event-propagation guard: clicking inside qa-group does not select the row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AgentRow agent={{ ...baseAgent, state: 'idle' }} onSelect={onSelect} />);
    const finish = screen.getByRole('button', { name: 'Finish' });
    await user.click(finish);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
