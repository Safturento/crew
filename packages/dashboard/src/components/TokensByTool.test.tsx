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

  it('recomputes percent client-side against the aliased-row total', () => {
    render(
      <TokensByTool
        tokensByTool={[
          { tool: 'Bash', tokens: 60_000, percent: 12 },
          { tool: 'Edit', tokens: 40_000, percent: 8 },
        ]}
        total={500_000}
      />,
    );
    const fills = screen.getAllByTestId('token-bar-fill');
    expect(fills[0]).toHaveStyle({ width: '60%' });
    expect(fills[1]).toHaveStyle({ width: '40%' });
  });

  it('collapses MCP rows into a single alias row with summed tokens', () => {
    render(
      <TokensByTool
        tokensByTool={[
          { tool: 'Bash', tokens: 12_000, percent: 60 },
          { tool: 'mcp__atlassian__jira_get_issue', tokens: 5_000, percent: 25 },
          { tool: 'mcp__atlassian__jira_transition_issue', tokens: 3_000, percent: 15 },
        ]}
        total={20_000}
      />,
    );
    const body = screen.getByTestId('tokens-by-tool-body');
    const labels = within(body).getAllByText(/^(Bash|MCP:Jira)$/);
    expect(labels.map((el) => el.textContent)).toEqual(['Bash', 'MCP:Jira']);
    // 12k + (5k + 3k) = 20k → 60% Bash, 40% MCP:Jira.
    const fills = within(body).getAllByTestId('token-bar-fill');
    expect(fills[0]).toHaveStyle({ width: '60%' });
    expect(fills[1]).toHaveStyle({ width: '40%' });
  });

  it('carries raw tool names in the row title for aliased rows', () => {
    render(
      <TokensByTool
        tokensByTool={[
          { tool: 'mcp__atlassian__jira_get_issue', tokens: 5_000, percent: 50 },
          { tool: 'mcp__atlassian__jira_transition_issue', tokens: 5_000, percent: 50 },
        ]}
        total={10_000}
      />,
    );
    const row = screen.getByText('MCP:Jira').closest('[title]');
    expect(row).toHaveAttribute('title', expect.stringContaining('mcp__atlassian__jira_get_issue'));
    expect(row).toHaveAttribute(
      'title',
      expect.stringContaining('mcp__atlassian__jira_transition_issue'),
    );
  });

  it('exposes an aria-label for assistive tech', () => {
    render(<TokensByTool tokensByTool={[]} total={0} />);
    expect(screen.getByRole('region', { name: /tokens by tool/i })).toBeInTheDocument();
  });

  // CREW-191: the daemon prepends an "Assistant" row to surface the model's
  // own output tokens. The frontend defensively re-pins it to first and
  // decorates it with a Sparkles icon.
  describe('Assistant row (CREW-191)', () => {
    it('renders an Assistant row with a sparkles icon', () => {
      render(
        <TokensByTool
          tokensByTool={[
            { tool: 'Assistant', tokens: 12_000, percent: 60 },
            { tool: 'Bash', tokens: 4_000, percent: 20 },
          ]}
          total={20_000}
        />,
      );
      const body = screen.getByTestId('tokens-by-tool-body');
      const assistantLabel = within(body).getByText('Assistant');
      const assistantRow = assistantLabel.parentElement;
      expect(assistantRow).not.toBeNull();
      const svg = assistantRow!.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.classList.contains('lucide-sparkles')).toBe(true);
    });

    it('does NOT render a sparkles icon on non-Assistant rows', () => {
      render(
        <TokensByTool
          tokensByTool={[{ tool: 'Bash', tokens: 4_000, percent: 100 }]}
          total={4_000}
        />,
      );
      const body = screen.getByTestId('tokens-by-tool-body');
      expect(body.querySelector('.lucide-sparkles')).toBeNull();
    });

    it('places the Assistant row first regardless of source array order', () => {
      render(
        <TokensByTool
          tokensByTool={[
            { tool: 'Bash', tokens: 999_000, percent: 99 },
            { tool: 'Assistant', tokens: 100, percent: 0.01 },
            { tool: 'Edit', tokens: 50_000, percent: 5 },
          ]}
          total={1_049_100}
        />,
      );
      const body = screen.getByTestId('tokens-by-tool-body');
      const labels = within(body).getAllByText(/^(Bash|Edit|Assistant)$/);
      expect(labels[0].textContent).toBe('Assistant');
    });
  });
});
