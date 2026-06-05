import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FinishSteps } from './FinishSteps.js';
import type { FinishStep } from '@/data/types';

function step(overrides: Partial<FinishStep>): FinishStep {
  return {
    key: 'KAN-1',
    index: 0,
    label: 'git fetch --prune origin',
    status: 'ok',
    detail: null,
    ts: 1000,
    ...overrides,
  };
}

describe('FinishSteps', () => {
  it('renders nothing when there are no steps', () => {
    const { container } = render(<FinishSteps steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one row per step, in order, with its label', () => {
    render(
      <FinishSteps
        steps={[
          step({ index: 0, label: 'git branch -D KAN-1', status: 'ok' }),
          step({ index: 1, label: 'jira KAN-1 → Done', status: 'skip' }),
        ]}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('git branch -D KAN-1');
    expect(rows[1]).toHaveTextContent('jira KAN-1 → Done');
  });

  it('marks each row with its status for ok/skip/error styling', () => {
    render(
      <FinishSteps
        steps={[
          step({ index: 0, label: 'a', status: 'ok' }),
          step({ index: 1, label: 'b', status: 'skip' }),
          step({ index: 2, label: 'c', status: 'error' }),
        ]}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveAttribute('data-status', 'ok');
    expect(rows[1]).toHaveAttribute('data-status', 'skip');
    expect(rows[2]).toHaveAttribute('data-status', 'error');
  });

  it('shows the detail text when a step carries one', () => {
    render(
      <FinishSteps
        steps={[step({ index: 0, label: 'git push origin --delete KAN-1', status: 'error', detail: 'remote rejected' })]}
      />,
    );
    expect(screen.getByText('remote rejected')).toBeInTheDocument();
  });
});
