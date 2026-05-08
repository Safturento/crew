import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TokenTable } from './TokenTable.js';

describe('TokenTable', () => {
  it('renders one row per distinct tool, sorted by token count desc by default', () => {
    render(
      <TokenTable
        rows={[
          { tool: 'Bash', tokens: 1000 },
          { tool: 'Read', tokens: 4000 },
        ]}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Read');
    expect(rows[1]).toHaveTextContent('Bash');
  });

  it('renders share-of-total %', () => {
    render(
      <TokenTable
        rows={[
          { tool: 'Read', tokens: 8000 },
          { tool: 'Bash', tokens: 2000 },
        ]}
      />,
    );
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
  });

  it('clicking the Tokens column header reverses sort', async () => {
    const user = userEvent.setup();
    render(
      <TokenTable
        rows={[
          { tool: 'Bash', tokens: 1000 },
          { tool: 'Read', tokens: 4000 },
        ]}
      />,
    );
    await user.click(screen.getByRole('columnheader', { name: /tokens/i }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Bash');
    expect(rows[1]).toHaveTextContent('Read');
  });

  it('clicking the Tool column header sorts alphabetically', async () => {
    const user = userEvent.setup();
    render(
      <TokenTable
        rows={[
          { tool: 'Read', tokens: 4000 },
          { tool: 'Bash', tokens: 1000 },
        ]}
      />,
    );
    await user.click(screen.getByRole('columnheader', { name: /^tool$/i }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Bash');
    expect(rows[1]).toHaveTextContent('Read');
  });

  it('renders a single empty-state row when there are no tools', () => {
    render(<TokenTable rows={[]} />);
    expect(screen.getByText(/no tool calls yet/i)).toBeInTheDocument();
  });

  it('renders 0% share when total is zero', () => {
    render(
      <TokenTable
        rows={[
          { tool: 'Read', tokens: 0 },
          { tool: 'Bash', tokens: 0 },
        ]}
      />,
    );
    const cells = screen.getAllByText('0%');
    expect(cells).toHaveLength(2);
  });
});
