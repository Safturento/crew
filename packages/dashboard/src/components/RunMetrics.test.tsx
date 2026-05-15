import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RunMetrics } from './RunMetrics.js';
import type { AgentDetailRun } from '../data/types.js';

function run(overrides: Partial<AgentDetailRun>): AgentDetailRun {
  return {
    id: '1',
    command: 'run',
    started_at: '2026-05-13T10:00:00Z',
    completed_at: '2026-05-13T11:00:00Z',
    doc_load_coverage_pct: null,
    cleanliness_pass: null,
    pr_claim_input_tokens: null,
    parity_violations: null,
    ...overrides,
  };
}

describe('RunMetrics', () => {
  it('renders the four metric values for a measured run', () => {
    render(
      <RunMetrics
        runs={[
          run({
            doc_load_coverage_pct: 80,
            cleanliness_pass: 1,
            pr_claim_input_tokens: 42000,
            parity_violations: 0,
          }),
        ]}
      />,
    );
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('pass')).toBeInTheDocument();
    expect(screen.getByText('42.0k')).toBeInTheDocument();
  });

  it('shows a not-yet-measured state when the latest run has no metrics', () => {
    render(<RunMetrics runs={[run({})]} />);
    expect(screen.getByText(/not yet measured/i)).toBeInTheDocument();
  });

  it('renders the most recent measured run when several runs exist', () => {
    render(
      <RunMetrics
        runs={[
          run({ id: '1', cleanliness_pass: 0, doc_load_coverage_pct: 10 }),
          run({ id: '2', cleanliness_pass: 1, doc_load_coverage_pct: 95 }),
        ]}
      />,
    );
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.queryByText('10%')).not.toBeInTheDocument();
  });

  it('renders nothing when there are no runs', () => {
    const { container } = render(<RunMetrics runs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
