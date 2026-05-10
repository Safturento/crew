import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentRow } from './AgentRow.js';
import type { Agent, AgentState } from '../data/types.js';

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

  it('renders cells in v2 column order: state, key, runtime, tokens, title, action', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    const row = screen.getByRole('button', { name: /KAN-31/ });
    const visibleChildren = Array.from(row.children).filter(
      (c) => c.getAttribute('aria-hidden') !== 'true',
    );
    const cellTexts = visibleChildren.map((c) => c.textContent ?? '');
    // state pill, key, runtime, tokens, title, action
    const keyIdx = cellTexts.findIndex((t) => t.includes('KAN-31'));
    const runtimeIdx = cellTexts.findIndex((t) => /^33m/.test(t));
    const tokensIdx = cellTexts.findIndex((t) => /48\.2k/.test(t));
    const titleIdx = cellTexts.findIndex((t) => t.includes('Add board archival endpoint'));
    expect(keyIdx).toBeLessThan(runtimeIdx);
    expect(runtimeIdx).toBeLessThan(tokensIdx);
    expect(tokensIdx).toBeLessThan(titleIdx);
  });

  it('renders the state badge', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Waiting');
  });

  it('renders a "Provide input" quick action for waiting state', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Provide input' })).toBeInTheDocument();
  });

  it('renders "View PR" + "Finish" quick actions for pr_open state', () => {
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
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
  });

  it('renders "Resume" + "Finish" quick actions for idle state', () => {
    render(<AgentRow agent={{ ...baseAgent, state: 'idle' }} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
  });

  it('renders no quick action for running/initializing/finished', () => {
    for (const state of ['running', 'initializing', 'finished'] as AgentState[]) {
      const { unmount } = render(
        <AgentRow agent={{ ...baseAgent, state }} onSelect={() => {}} />,
      );
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

  it('renders an "Inspect" quick action for error state', () => {
    render(<AgentRow agent={{ ...baseAgent, state: 'error' }} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Inspect' })).toBeInTheDocument();
  });

  it('forwards onAction events with kind + agent', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <AgentRow
        agent={{ ...baseAgent, state: 'idle' }}
        onSelect={() => {}}
        onAction={onAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onAction).toHaveBeenCalledWith('resume', expect.objectContaining({ key: 'KAN-31' }));
  });

  const ATTENTION_TOKENS: Array<[AgentState, string, string]> = [
    ['waiting', 'border-state-waiting/30', 'bg-state-waiting/10'],
    ['error', 'border-state-error/30', 'bg-state-error/10'],
    ['pr_open', 'border-state-pr-open/30', 'bg-state-pr-open/10'],
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

  const NON_ATTENTION_STATES: AgentState[] = ['initializing', 'running', 'idle', 'finished'];

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
    render(
      <AgentRow agent={{ ...baseAgent, state: 'idle' }} onSelect={onSelect} />,
    );
    const finish = screen.getByRole('button', { name: 'Finish' });
    await user.click(finish);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('row uses the v2 6-track grid template (state · key · runtime · tokens · title · action)', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    const row = screen.getByRole('button', { name: /KAN-31/ });
    expect(row.className).toContain('grid-cols-[100px_90px_90px_70px_1fr_168px]');
    expect(within(row).getByRole('status')).toBeInTheDocument();
  });
});
