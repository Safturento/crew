import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AgentDetailTokensByTool } from '../../data/types.js';
import { Filters, defaultTimelineFilterState, type TimelineFilterState } from './Filters.js';

const rows: AgentDetailTokensByTool[] = [
  { tool: 'Bash', tokens: 12_600_000, percent: 50 },
  { tool: 'Edit', tokens: 3_400_000, percent: 13 },
  { tool: 'mcp__atlassian__jira_get_issue', tokens: 400_000, percent: 2 },
  { tool: 'mcp__atlassian__jira_transition_issue', tokens: 200_000, percent: 1 },
  { tool: 'mcp__plugin_figma_figma__use_figma', tokens: 309_000, percent: 1 },
];

describe('Filters', () => {
  it('opens the popover and shows the Slim 5 category rows', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    for (const label of ['Conversation', 'Tools', 'Thinking', 'Hooks & skills', 'System']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('renders alias-aggregated tool rows in descending order', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    // 5 raw rows collapse to Bash, Edit, MCP:Jira, MCP:Figma -> 4 alias rows.
    const aliasNames = ['Bash', 'Edit', 'MCP:Jira', 'MCP:Figma'];
    for (const a of aliasNames) {
      expect(screen.getByLabelText(a)).toBeInTheDocument();
    }
    // Descending by alias-summed tokens: Bash > Edit > MCP:Jira (600k) > MCP:Figma (309k).
    const toolInputs = document.querySelectorAll('input[id^="filter-tool-"]');
    expect(Array.from(toolInputs).map((el) => el.id)).toEqual([
      'filter-tool-Bash',
      'filter-tool-Edit',
      'filter-tool-MCP:Jira',
      'filter-tool-MCP:Figma',
    ]);
  });

  it('hover/title text on each tool row lists the raw contributors', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    const jiraRow = screen.getByLabelText('MCP:Jira').closest('label')!;
    expect(jiraRow).toHaveAttribute(
      'title',
      expect.stringContaining('mcp__atlassian__jira_get_issue'),
    );
    expect(jiraRow).toHaveAttribute(
      'title',
      expect.stringContaining('mcp__atlassian__jira_transition_issue'),
    );
  });

  it('toggling a category fires onChange with the new set', async () => {
    const onChange = vi.fn<(next: TimelineFilterState) => void>();
    render(<Filters state={defaultTimelineFilterState} onChange={onChange} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByLabelText('Thinking'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0];
    expect(next.categories.has('thinking')).toBe(true);
    expect(next.categories.has('conversation')).toBe(true);
    expect(next.tools.size).toBe(0);
  });

  it('toggling a tool adds the alias to the tools set', async () => {
    const onChange = vi.fn<(next: TimelineFilterState) => void>();
    render(<Filters state={defaultTimelineFilterState} onChange={onChange} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByLabelText('MCP:Jira'));
    const next = onChange.mock.calls[0]![0];
    expect(next.tools.has('MCP:Jira')).toBe(true);
  });

  it('shows no badge when the current selection equals the default', () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    expect(screen.queryByTestId('filters-badge')).toBeNull();
  });

  it('shows a numeric badge when the selection diverges from default', () => {
    const diverged: TimelineFilterState = {
      categories: new Set(['conversation', 'tools', 'thinking']),
      tools: new Set(['Bash']),
    };
    render(<Filters state={diverged} onChange={() => {}} tokensByTool={rows} />);
    // 1 extra category (thinking) + 1 tool restriction = 2.
    const badge = screen.getByTestId('filters-badge');
    expect(badge).toHaveTextContent('2');
  });

  it('renders an empty-state hint when tokensByTool is empty', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    const popover = screen.getByText(/no tool usage yet/i);
    expect(popover).toBeInTheDocument();
    // Sanity-check it sits in the Tools section by finding the Tools heading sibling.
    const section = popover.closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(/Tools/)).toBeInTheDocument();
  });
});
