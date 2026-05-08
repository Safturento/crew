import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StateHistoryBar } from './StateHistoryBar.js';

describe('StateHistoryBar', () => {
  it('renders transitions as inline pills with arrows between them', () => {
    render(
      <StateHistoryBar
        transitions={[
          { from: null, to: 'init', ts: 1 },
          { from: 'init', to: 'running', ts: 2 },
          { from: 'running', to: 'pr_open', ts: 3 },
        ]}
        onScrollTo={() => {}}
      />,
    );
    const pills = screen.getAllByRole('button');
    expect(pills).toHaveLength(3);
    expect(pills[0]).toHaveTextContent('Initializing');
    expect(pills[1]).toHaveTextContent('Running');
    expect(pills[2]).toHaveTextContent('PR open');
    expect(screen.getAllByTestId('state-history-arrow')).toHaveLength(2);
  });

  it('clicking a transition fires onScrollTo with that transition ts', async () => {
    const user = userEvent.setup();
    const onScrollTo = vi.fn();
    render(
      <StateHistoryBar
        transitions={[{ from: null, to: 'init', ts: 7 }]}
        onScrollTo={onScrollTo}
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(onScrollTo).toHaveBeenCalledWith(7);
  });

  it('uses literal STATE_CLASSES Tailwind tokens for each pill', () => {
    render(
      <StateHistoryBar
        transitions={[{ from: null, to: 'pr_open', ts: 1 }]}
        onScrollTo={() => {}}
      />,
    );
    const pill = screen.getByRole('button');
    expect(pill.className).toContain('state-pr-open');
  });

  it('renders nothing visible when there are no transitions', () => {
    const { container } = render(
      <StateHistoryBar transitions={[]} onScrollTo={() => {}} />,
    );
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
