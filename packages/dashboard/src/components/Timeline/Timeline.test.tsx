import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';

import { Timeline } from './Timeline.js';
import { useStateHistory, useTimeline } from '../../data/queries.js';
import type {
  AgentDetailTokensByTool,
  StateTransition,
  TranscriptEvent,
} from '../../data/types.js';

vi.mock('../../data/queries.js', () => ({
  useTimeline: vi.fn(),
  useStateHistory: vi.fn(),
}));

// jsdom returns 0 for layout dimensions, which makes useVirtualizer
// render zero rows. Stub clientHeight/getBoundingClientRect at the
// HTMLElement prototype so the virtualizer thinks the scroll element
// has real height.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 800,
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      width: 800,
      height: 800,
      top: 0,
      left: 0,
      right: 800,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      StubResizeObserver as unknown as typeof ResizeObserver;
  }
});

const mockUseTimeline = vi.mocked(useTimeline);
const mockUseStateHistory = vi.mocked(useStateHistory);

type TimelineQueryResult = UseQueryResult<{ events: TranscriptEvent[]; warnings?: string[] }>;

function timelineResult(partial: Partial<TimelineQueryResult>): TimelineQueryResult {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
    isPending: false,
    isFetching: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isStale: false,
    isPlaceholderData: false,
    isRefetching: false,
    refetch: vi.fn(),
    status: 'success',
    fetchStatus: 'idle',
    ...partial,
  } as unknown as TimelineQueryResult;
}

type StateHistoryQueryResult = UseQueryResult<{ transitions: StateTransition[] }>;

function stateHistoryResult(transitions: StateTransition[]): StateHistoryQueryResult {
  return {
    data: { transitions },
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: true,
    isPending: false,
    isFetching: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isStale: false,
    isPlaceholderData: false,
    isRefetching: false,
    refetch: vi.fn(),
    status: 'success',
    fetchStatus: 'idle',
  } as unknown as StateHistoryQueryResult;
}

const evt = (i: number): TranscriptEvent =>
  ({
    type: 'assistant',
    uuid: `uuid-${i}`,
    timestamp: `2026-04-29T12:00:0${i}Z`,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: `event ${i}` }],
      usage: { output_tokens: 0 },
    },
  }) as unknown as TranscriptEvent;

const assistantToolUse = (i: number, name: string): TranscriptEvent =>
  ({
    type: 'assistant',
    uuid: `uuid-${i}`,
    timestamp: `2026-04-29T12:00:0${i}Z`,
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: `t${i}`, name, input: {} }],
      usage: { output_tokens: 0 },
    },
  }) as unknown as TranscriptEvent;

const assistantThinking = (i: number, text: string): TranscriptEvent =>
  ({
    type: 'assistant',
    uuid: `uuid-${i}`,
    timestamp: `2026-04-29T12:00:0${i}Z`,
    message: {
      role: 'assistant',
      content: [{ type: 'thinking', thinking: text }],
      usage: { output_tokens: 0 },
    },
  }) as unknown as TranscriptEvent;

const userToolResult = (i: number, toolUseId: string, text: string): TranscriptEvent =>
  ({
    type: 'user',
    uuid: `uuid-${i}`,
    timestamp: `2026-04-29T12:00:0${i}Z`,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text }],
    },
  }) as unknown as TranscriptEvent;

const openFilters = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: /open timeline filters/i }));
};

const expandTools = async (): Promise<void> => {
  await userEvent.click(screen.getByTestId('tools-disclosure'));
};

const isCategoryChecked = (label: string): boolean =>
  screen.getByLabelText(label).getAttribute('aria-checked') === 'true';

const sampleTokensByTool: AgentDetailTokensByTool[] = [
  {
    tool: 'Bash',
    tokens: { input: 0, output: 10_000, cacheCreation: 0, cacheRead: 0 },
    totalTokens: 10_000,
  },
  {
    tool: 'Read',
    tokens: { input: 0, output: 4_000, cacheCreation: 0, cacheRead: 0 },
    totalTokens: 4_000,
  },
  {
    tool: 'mcp__atlassian__jira_get_issue',
    tokens: { input: 0, output: 1_000, cacheCreation: 0, cacheRead: 0 },
    totalTokens: 1_000,
  },
];

describe('Timeline', () => {
  beforeEach(() => {
    mockUseTimeline.mockReset();
    mockUseStateHistory.mockReset();
    mockUseStateHistory.mockReturnValue(stateHistoryResult([]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders one TranscriptRow per event from useTimeline', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2), evt(3)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" />);
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(3);
  });

  it('shows a loading state', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({ data: undefined, isLoading: true, isPending: true, status: 'pending' }),
    );
    render(<Timeline agentKey="KAN-1" />);
    expect(screen.getByTestId('timeline-loading')).toBeInTheDocument();
  });

  it('subscribes to useTimeline with the agent key', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({ data: { events: [] }, isSuccess: true, status: 'success' }),
    );
    render(<Timeline agentKey="KAN-7" />);
    expect(mockUseTimeline).toHaveBeenCalledWith('KAN-7');
  });

  it('renders an empty state when the timeline has no events', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({ data: { events: [] }, isSuccess: true, status: 'success' }),
    );
    render(<Timeline agentKey="KAN-1" />);
    expect(screen.getByTestId('timeline-empty')).toBeInTheDocument();
  });

  it('CREW-201 startup phase rows are visible by default even though System filter is off', () => {
    const startupRow = {
      type: 'system',
      subtype: 'crew_startup_npm_install',
      startedAt: '2026-04-29T12:00:00.000Z',
      completedAt: '2026-04-29T12:00:01.000Z',
      status: 'completed',
      summary: 'installed 152 packages',
      durationMs: 1000,
      logPath: null,
    } as unknown as TranscriptEvent;
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [startupRow, evt(1)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" />);
    // Both render: the assistant text row and the startup phase row.
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(2);
    const tags = screen.getAllByTestId('transcript-row-tag').map((n) => n.textContent);
    expect(tags).toContain('npm install');
  });

  it('drops bookkeeping events (DROPPED_TYPES) before classification', () => {
    const droppable = {
      type: 'queue-operation',
      uuid: 'q1',
      timestamp: '2026-04-29T12:00:09Z',
      operation: 'enqueue',
    } as unknown as TranscriptEvent;
    const queuedCmd = {
      type: 'attachment',
      uuid: 'a1',
      timestamp: '2026-04-29T12:00:09Z',
      attachment: { type: 'queued_command' },
    } as unknown as TranscriptEvent;
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [droppable, evt(1), queuedCmd] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" />);
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(1);
  });

  it('filters events by case-insensitive substring against the one-liner', async () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: {
          events: [assistantToolUse(1, 'Bash'), assistantToolUse(2, 'Read')],
        },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" />);
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(2);
    await userEvent.type(screen.getByRole('searchbox'), 'bash');
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(1);
  });

  it('defaults live mode ON for an active agent', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" agentState="running" />);
    expect(screen.getByRole('switch', { name: /live/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('defaults live mode OFF for a finished agent', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" agentState="finished" />);
    expect(screen.getByRole('switch', { name: /live/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('defaults live mode OFF for an errored agent', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" agentState="error" />);
    expect(screen.getByRole('switch', { name: /live/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('never shows a new-events pill, even when events arrive while live mode is OFF', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    const { rerender } = render(<Timeline agentKey="KAN-1" agentState="finished" />);
    expect(screen.queryByRole('button', { name: /new events/i })).toBeNull();
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2), evt(3), evt(4)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    rerender(<Timeline agentKey="KAN-1" agentState="finished" />);
    expect(screen.queryByRole('button', { name: /new events/i })).toBeNull();
  });

  it('renders the all-off empty state when every category is toggled off', async () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), assistantToolUse(2, 'Bash')] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" />);
    await openFilters();
    for (const label of [
      'Conversation',
      'Tools',
      'Thinking',
      'Hooks',
      'Skills',
      'System',
      'Startup',
    ]) {
      if (isCategoryChecked(label)) await userEvent.click(screen.getByLabelText(label));
    }
    expect(screen.getByText(/No events match your filters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show all/i })).toBeInTheDocument();
    expect(screen.queryAllByTestId('transcript-row')).toHaveLength(0);
  });

  it('clicking "Show all" resets filters to the curated defaults', async () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), assistantToolUse(2, 'Bash')] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" />);
    await openFilters();
    await userEvent.click(screen.getByLabelText('Conversation'));
    await userEvent.click(screen.getByLabelText('Tools'));
    expect(screen.getByText(/No events match your filters/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Show all/i }));
    await openFilters();
    expect(isCategoryChecked('Conversation')).toBe(true);
    expect(isCategoryChecked('Tools')).toBe(true);
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(2);
  });

  it('hides events whose category is toggled off', async () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: {
          events: [assistantToolUse(1, 'Bash'), evt(2), assistantThinking(3, 'pondering')],
        },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" />);
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(2);
    await openFilters();
    await userEvent.click(screen.getByLabelText('Thinking'));
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(3);
    await userEvent.click(screen.getByLabelText('Conversation'));
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(2);
  });

  it('all-checked (default) shows every tool event; unchecking a tool subtracts those events', async () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: {
          events: [
            assistantToolUse(1, 'Bash'),
            assistantToolUse(2, 'Read'),
            assistantToolUse(3, 'mcp__atlassian__jira_get_issue'),
          ],
        },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" tokensByTool={sampleTokensByTool} />);
    // Default = all-known mode, all 3 visible.
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(3);
    await openFilters();
    await expandTools();
    // Uncheck Bash — only its event disappears.
    await userEvent.click(screen.getByLabelText('Bash'));
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(2);
    // Uncheck MCP:Jira too — only the Read event remains.
    await userEvent.click(screen.getByLabelText('MCP:Jira'));
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(1);
  });

  it('regression: tool_result events filter out alongside their tool_use', async () => {
    // The bug: tool_result events were classified into the `tools` category
    // but their parent tool name was unresolvable, so they slipped past
    // per-tool filtering. After wiring `buildToolNameMap`, the tool_result
    // resolves to the same alias as its tool_use and disappears together.
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: {
          events: [
            assistantToolUse(1, 'mcp__atlassian__jira_get_issue'),
            userToolResult(2, 't1', 'CREW-207 details ...'),
            evt(3),
          ],
        },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" tokensByTool={sampleTokensByTool} />);
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(3);
    await openFilters();
    await expandTools();
    await userEvent.click(screen.getByLabelText('MCP:Jira'));
    // Both the assistant tool_use AND the matching user tool_result row are
    // hidden; only the conversation event remains.
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(1);
  });

  it('non-tool events stay visible regardless of tool exclusions', async () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: {
          events: [evt(1), assistantToolUse(2, 'Bash')],
        },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" tokensByTool={sampleTokensByTool} />);
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(2);
    await openFilters();
    await expandTools();
    // Uncheck every tool the agent used — the conversation event remains.
    for (const alias of ['Bash', 'Read', 'MCP:Jira']) {
      await userEvent.click(screen.getByLabelText(alias));
    }
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(1);
  });

  it('falls back to a single section tagged with agentState when transitions is empty', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    mockUseStateHistory.mockReturnValue(stateHistoryResult([]));
    render(<Timeline agentKey="KAN-1" agentState="running" />);
    const sections = screen.getAllByTestId('timeline-section');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toHaveAttribute('data-state', 'running');
  });

  it('groups events into per-state sections when transitions are available', () => {
    const transitions: StateTransition[] = [
      { from: null, to: 'init', ts: Date.parse('2026-04-29T11:59:50Z') },
      { from: 'init', to: 'running', ts: Date.parse('2026-04-29T12:00:01.5Z') },
      { from: 'running', to: 'waiting', ts: Date.parse('2026-04-29T12:00:03Z') },
    ];
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2), evt(3)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    mockUseStateHistory.mockReturnValue(stateHistoryResult(transitions));
    render(<Timeline agentKey="KAN-1" agentState="waiting" />);
    const sections = screen.getAllByTestId('timeline-section');
    // N transitions yield N+1 sections; the first is the leading initial-state
    // section (from === null falls back to 'init' → 'initializing'), the second
    // is the to: 'init' section (also 'initializing').
    expect(sections.map((s) => s.getAttribute('data-state'))).toEqual([
      'initializing',
      'initializing',
      'running',
      'waiting',
    ]);
  });

  it('Collapse-all collapses every section in one click', async () => {
    const transitions: StateTransition[] = [
      { from: null, to: 'init', ts: Date.parse('2026-04-29T11:59:50Z') },
      { from: 'init', to: 'running', ts: Date.parse('2026-04-29T12:00:01.5Z') },
    ];
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    mockUseStateHistory.mockReturnValue(stateHistoryResult(transitions));
    render(<Timeline agentKey="KAN-1" agentState="running" />);
    expect(screen.getAllByTestId('transcript-row').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /collapse all/i }));
    expect(screen.queryAllByTestId('transcript-row')).toHaveLength(0);
    const toggles = screen.getAllByRole('button', { name: /toggle/i });
    for (const t of toggles) {
      expect(t).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('renders the toolbar outside the scroll viewport and not sticky', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    const { container } = render(<Timeline agentKey="KAN-1" agentState="running" />);
    const toolbar = screen.getByTestId('timeline-toolbar');
    expect(toolbar.className).not.toMatch(/\bsticky\b/);
    const scroll = container.querySelector('[class*="overflow-y-auto"]');
    expect(scroll?.contains(toolbar)).toBe(false);
  });

  it('keeps exactly one scroll viewport with the toolbar lifted above it', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    const { container } = render(<Timeline agentKey="KAN-1" agentState="running" />);
    const scrollables = container.querySelectorAll('[class*="overflow-y-auto"]');
    expect(scrollables.length).toBe(1);
    // Toolbar is a sibling above the viewport, not inside it.
    expect(scrollables[0].contains(screen.getByTestId('timeline-toolbar'))).toBe(false);
  });

  it('mounts MinimapStripe alongside the scroll viewport when there are sections', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" agentState="running" />);
    expect(screen.queryByTestId('minimap-stripe')).toBeInTheDocument();
  });

  it('does not mount MinimapStripe when there are no events', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" agentState="running" />);
    expect(screen.queryByTestId('minimap-stripe')).not.toBeInTheDocument();
  });

  it('breaks live mode when a minimap segment is clicked', async () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" agentState="running" />);
    const liveToggle = screen.getByRole('switch', { name: /live/i });
    expect(liveToggle).toHaveAttribute('aria-checked', 'true');
    const segment = screen.getAllByTestId('minimap-segment')[0];
    await userEvent.click(segment);
    expect(liveToggle).toHaveAttribute('aria-checked', 'false');
  });

  it('toggling a single section is independent of the others', async () => {
    const transitions: StateTransition[] = [
      { from: null, to: 'init', ts: Date.parse('2026-04-29T11:59:50Z') },
      { from: 'init', to: 'running', ts: Date.parse('2026-04-29T12:00:01.5Z') },
    ];
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    mockUseStateHistory.mockReturnValue(stateHistoryResult(transitions));
    render(<Timeline agentKey="KAN-1" agentState="running" />);
    const toggles = screen.getAllByRole('button', { name: /toggle/i });
    // Leading initial-state section adds one toggle on top of the 2 transitions.
    expect(toggles).toHaveLength(3);
    await userEvent.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'false');
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'true');
    expect(toggles[2]).toHaveAttribute('aria-expanded', 'true');
  });
});
