import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TokensByTool } from './TokensByTool.js';

describe('TokensByTool', () => {
  it('renders one TokenBarRow per input, preserving order', () => {
    render(
      <TokensByTool
        tokensByTool={[
          { tool: 'Bash', tokens: 18_400, percent: 38.4 },
          { tool: 'Read', tokens: 12_100, percent: 25.2 },
          { tool: 'Edit', tokens: 9_600, percent: 20.1 },
        ]}
        total={48_000}
      />,
    );
    const body = screen.getByTestId('tokens-by-tool-body');
    const tools = within(body).getAllByText(/^(Bash|Read|Edit)$/);
    expect(tools.map((el) => el.textContent)).toEqual(['Bash', 'Read', 'Edit']);
  });

  it('renders the column header labels', () => {
    render(<TokensByTool tokensByTool={[]} total={0} />);
    expect(screen.getByText(/^tool$/i)).toBeInTheDocument();
    expect(screen.getByText(/^tokens$/i)).toBeInTheDocument();
    expect(screen.getByText(/^share$/i)).toBeInTheDocument();
  });

  it('renders the formatted total in the footer', () => {
    render(
      <TokensByTool
        tokensByTool={[{ tool: 'Bash', tokens: 18_400, percent: 100 }]}
        total={48_000}
      />,
    );
    const footer = screen.getByTestId('tokens-by-tool-footer');
    expect(within(footer).getByText(/^total$/i)).toBeInTheDocument();
    expect(within(footer).getByText('48.0k')).toBeInTheDocument();
  });

  it('formats the total with tabular-nums', () => {
    render(<TokensByTool tokensByTool={[]} total={48_000} />);
    const footer = screen.getByTestId('tokens-by-tool-footer');
    expect(within(footer).getByText('48.0k').className).toMatch(/tabular-nums/);
  });

  it('renders an empty-state row when tokens_by_tool is empty', () => {
    render(<TokensByTool tokensByTool={[]} total={0} />);
    expect(screen.getByText(/no tool usage yet/i)).toBeInTheDocument();
  });

  it('does not render any TokenBarRow when array is empty', () => {
    render(<TokensByTool tokensByTool={[]} total={0} />);
    const body = screen.getByTestId('tokens-by-tool-body');
    expect(within(body).queryByTestId('token-bar-fill')).not.toBeInTheDocument();
  });

  it('passes percent through to TokenBarRow unchanged', () => {
    render(
      <TokensByTool
        tokensByTool={[{ tool: 'Read', tokens: 12_100, percent: 25.2 }]}
        total={48_000}
      />,
    );
    expect(screen.getByTestId('token-bar-fill')).toHaveStyle({ width: '25.2%' });
  });

  it('exposes an aria-label for assistive tech', () => {
    render(<TokensByTool tokensByTool={[]} total={0} />);
    expect(screen.getByRole('region', { name: /tokens by tool/i })).toBeInTheDocument();
  });
});
