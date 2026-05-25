import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AgentDetailTokensByTool } from '../../data/types.js';
import { Filters } from './Filters.js';
import { defaultTimelineFilterState, type TimelineFilterState } from './filter-state.js';

const bucket = (output: number) => ({ input: 0, output, cacheCreation: 0, cacheRead: 0 });
const rows: AgentDetailTokensByTool[] = [
  { tool: 'Bash', tokens: bucket(12_600_000), totalTokens: 12_600_000 },
  { tool: 'Edit', tokens: bucket(3_400_000), totalTokens: 3_400_000 },
  { tool: 'mcp__atlassian__jira_get_issue', tokens: bucket(400_000), totalTokens: 400_000 },
  { tool: 'mcp__atlassian__jira_transition_issue', tokens: bucket(200_000), totalTokens: 200_000 },
  { tool: 'mcp__plugin_figma_figma__use_figma', tokens: bucket(309_000), totalTokens: 309_000 },
];

describe('Filters (inclusion-tree)', () => {
  it('opens the popover and shows the seven categories', async () => {
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

  it('Tools row shows "4 / 4" count and hides the alias subtree by default', async () => {
    // Five raw tokensByTool rows collapse to four aliases (the two Jira MCP
    // tools aggregate into a single `MCP:Jira` row).
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    const toolsRow = screen.getByTestId('filter-row-tools');
    expect(toolsRow).toHaveTextContent('4 / 4');
    expect(screen.queryByLabelText('Bash')).toBeNull();
  });

  it('clicking the Tools chevron expands the alias subtree', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByTestId('tools-disclosure'));
    for (const a of ['Bash', 'Edit', 'MCP:Jira', 'MCP:Figma']) {
      expect(screen.getByLabelText(a)).toBeInTheDocument();
    }
  });

  it('badge hidden when visible === total (everything selected)', () => {
    const everythingState: TimelineFilterState = {
      categories: new Set([
        'conversation',
        'tools',
        'thinking',
        'hooks',
        'skills',
        'system',
        'startup',
      ]),
      tools: { mode: 'all-known', set: new Set() },
    };
    render(<Filters state={everythingState} onChange={() => {}} tokensByTool={rows} />);
    expect(screen.queryByTestId('filters-badge')).toBeNull();
  });

  it('badge shows visible/total in default state', () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    // Default: conv + tools + startup ON. Visible = 2 non-tools + 4 aliases = 6.
    // Total = 6 non-tools + 4 aliases = 10.
    expect(screen.getByTestId('filters-badge')).toHaveTextContent('6 / 10');
  });

  it('clicking a category leaf calls onChange with toggled state', async () => {
    const onChange = vi.fn<(s: TimelineFilterState) => void>();
    render(<Filters state={defaultTimelineFilterState} onChange={onChange} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByLabelText('Thinking'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].categories.has('thinking')).toBe(true);
  });

  it('clicking Select all puts state into the all-checked all-known shape', async () => {
    const onChange = vi.fn<(s: TimelineFilterState) => void>();
    render(<Filters state={defaultTimelineFilterState} onChange={onChange} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByRole('button', { name: /select all/i }));
    const next = onChange.mock.calls[0]![0];
    expect(next.categories.size).toBe(7);
    expect(next.tools.mode).toBe('all-known');
    expect(next.tools.set.size).toBe(0);
  });

  it('clicking Clear puts state into empty-categories explicit-empty-tools', async () => {
    const onChange = vi.fn<(s: TimelineFilterState) => void>();
    render(<Filters state={defaultTimelineFilterState} onChange={onChange} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByRole('button', { name: /clear/i }));
    const next = onChange.mock.calls[0]![0];
    expect(next.categories.size).toBe(0);
    expect(next.tools.mode).toBe('explicit');
  });

  it('clicking a disabled-looking tool child (master off) auto-enables master AND checks child', async () => {
    const onChange = vi.fn<(s: TimelineFilterState) => void>();
    const masterOff: TimelineFilterState = {
      categories: new Set(['conversation']),
      tools: { mode: 'explicit', set: new Set() },
    };
    render(<Filters state={masterOff} onChange={onChange} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByTestId('tools-disclosure'));
    await userEvent.click(screen.getByLabelText('Bash'));
    const next = onChange.mock.calls[0]![0];
    expect(next.categories.has('tools')).toBe(true);
    expect(next.tools.set.has('Bash')).toBe(true);
  });

  it('renders alias-aggregated tool rows in descending order', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={rows} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByTestId('tools-disclosure'));
    const inputs = document.querySelectorAll('button[id^="filter-tool-"]');
    expect(Array.from(inputs).map((el) => el.id)).toEqual([
      'filter-tool-Bash',
      'filter-tool-Edit',
      'filter-tool-MCP:Jira',
      'filter-tool-MCP:Figma',
    ]);
  });

  it('empty tokensByTool: subtree expansion shows an empty-state hint', async () => {
    render(<Filters state={defaultTimelineFilterState} onChange={() => {}} tokensByTool={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
    await userEvent.click(screen.getByTestId('tools-disclosure'));
    expect(screen.getByText(/no tool usage yet/i)).toBeInTheDocument();
  });
});
