import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AgentDetailTokensByTool } from '../../data/types.js';
import { Filters, defaultTimelineFilterState, type TimelineFilterState } from './Filters.js';

const bucket = (output: number) => ({ input: 0, output, cacheCreation: 0, cacheRead: 0 });
const rows: AgentDetailTokensByTool[] = [
  { tool: 'Bash', tokens: bucket(12_600_000), totalTokens: 12_600_000 },
  { tool: 'Edit', tokens: bucket(3_400_000), totalTokens: 3_400_000 },
  { tool: 'mcp__atlassian__jira_get_issue', tokens: bucket(400_000), totalTokens: 400_000 },
  { tool: 'mcp__atlassian__jira_transition_issue', tokens: bucket(200_000), totalTokens: 200_000 },
  { tool: 'mcp__plugin_figma_figma__use_figma', tokens: bucket(309_000), totalTokens: 309_000 },
];

describe('Filters', () => {
  it('opens the popover and shows the Slim 7 category rows', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    for (const label of [
      'Conversation',
      'Tools',
      'Thinking',
      'Hooks',
      'Skills',
      'System',
      'Startup',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('renders alias-aggregated tool rows in descending order', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    const aliasNames = ['Bash', 'Edit', 'MCP:Jira', 'MCP:Figma'];
    for (const a of aliasNames) {
      expect(screen.getByLabelText(a)).toBeInTheDocument();
    }
    const toolInputs = document.querySelectorAll('input[id^="filter-tool-"]');
    expect(Array.from(toolInputs).map((el) => el.id)).toEqual([
      'filter-tool-Bash',
      'filter-tool-Edit',
      'filter-tool-MCP:Jira',
      'filter-tool-MCP:Figma',
    ]);
  });

  it('default state renders every tool row already checked (inverted-checkbox semantics)', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    for (const a of ['Bash', 'Edit', 'MCP:Jira', 'MCP:Figma']) {
      expect((screen.getByLabelText(a) as HTMLInputElement).checked).toBe(true);
    }
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
    expect(next.excludedTools.size).toBe(0);
  });

  it('unchecking a tool adds the alias to excludedTools', async () => {
    const onChange = vi.fn<(next: TimelineFilterState) => void>();
    render(<Filters state={defaultTimelineFilterState} onChange={onChange} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByLabelText('MCP:Jira'));
    const next = onChange.mock.calls[0]![0];
    expect(next.excludedTools.has('MCP:Jira')).toBe(true);
    expect(next.excludedTools.size).toBe(1);
  });

  it('re-checking an excluded tool removes it from excludedTools', async () => {
    const onChange = vi.fn<(next: TimelineFilterState) => void>();
    const stateWithExclusion: TimelineFilterState = {
      categories: new Set(['conversation', 'tools']),
      excludedTools: new Set(['Bash']),
    };
    render(<Filters state={stateWithExclusion} onChange={onChange} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    // Bash row should currently render UNCHECKED.
    expect((screen.getByLabelText('Bash') as HTMLInputElement).checked).toBe(false);
    await userEvent.click(screen.getByLabelText('Bash'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].excludedTools.has('Bash')).toBe(false);
  });

  it('shows no badge when the current selection equals the default', () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    expect(screen.queryByTestId('filters-badge')).toBeNull();
  });

  it('shows a numeric badge counting category toggles + excluded tools', () => {
    const diverged: TimelineFilterState = {
      // Defaults: conversation + tools + startup ON, rest OFF.
      // Add `thinking` (was OFF) → +1; everything else matches default → +0.
      categories: new Set(['conversation', 'tools', 'thinking', 'startup']),
      excludedTools: new Set(['Bash']),
    };
    render(<Filters state={diverged} onChange={() => {}} tokensByTool={rows} />);
    // 1 extra category (thinking) + 1 excluded tool = 2.
    const badge = screen.getByTestId('filters-badge');
    expect(badge).toHaveTextContent('2');
  });

  it('renders an empty-state hint when tokensByTool is empty', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    const popover = screen.getByText(/no tool usage yet/i);
    expect(popover).toBeInTheDocument();
    const section = popover.closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText(/Tools/)).toBeInTheDocument();
  });
});
