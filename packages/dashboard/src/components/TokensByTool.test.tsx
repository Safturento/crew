import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AgentDetailTokensByTool } from '../data/types.js';
import { TokensByTool } from './TokensByTool.js';

const bucket = (output: number) => ({ input: 0, output, cacheCreation: 0, cacheRead: 0 });
const row = (tool: string, output: number): AgentDetailTokensByTool => ({
  tool,
  tokens: bucket(output),
  totalTokens: output,
});

describe('TokensByTool', () => {
  it('renders one TokenBarRow per input, preserving order', () => {
    render(
      <TokensByTool
        tokensByTool={[row('Bash', 18_400), row('Read', 12_100), row('Edit', 9_600)]}
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
    render(<TokensByTool tokensByTool={[row('Bash', 18_400)]} total={48_000} />);
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
        tokensByTool={[row('Bash', 60_000), row('Edit', 40_000)]}
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
          row('Bash', 12_000),
          row('mcp__atlassian__jira_get_issue', 5_000),
          row('mcp__atlassian__jira_transition_issue', 3_000),
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
          row('mcp__atlassian__jira_get_issue', 5_000),
          row('mcp__atlassian__jira_transition_issue', 5_000),
        ]}
        total={10_000}
      />,
    );
    const target = screen.getByText('MCP:Jira').closest('[title]');
    expect(target).toHaveAttribute(
      'title',
      expect.stringContaining('mcp__atlassian__jira_get_issue'),
    );
    expect(target).toHaveAttribute(
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
          tokensByTool={[row('Assistant', 12_000), row('Bash', 4_000)]}
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
      render(<TokensByTool tokensByTool={[row('Bash', 4_000)]} total={4_000} />);
      const body = screen.getByTestId('tokens-by-tool-body');
      expect(body.querySelector('.lucide-sparkles')).toBeNull();
    });

    it('places the Assistant row first regardless of source array order', () => {
      render(
        <TokensByTool
          tokensByTool={[row('Bash', 999_000), row('Assistant', 100), row('Edit', 50_000)]}
          total={1_049_100}
        />,
      );
      const body = screen.getByTestId('tokens-by-tool-body');
      const labels = within(body).getAllByText(/^(Bash|Edit|Assistant)$/);
      expect(labels[0].textContent).toBe('Assistant');
    });
  });
});
