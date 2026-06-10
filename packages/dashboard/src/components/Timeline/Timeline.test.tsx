import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';

import { Timeline, eventKey } from './Timeline.js';
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
    // Filters now write through to sessionStorage on every render; clear it so
    // a key reused across tests doesn't seed the next render with stale filters.
    sessionStorage.clear();
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
    // The Filters popover is modal, so the timeline body is aria-hidden behind
    // it. Close the popover before asserting on the empty-state controls.
    await userEvent.keyboard('{Escape}');
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
    // Close the modal Filters popover before reaching the empty-state behind it.
    await userEvent.keyboard('{Escape}');
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

  it('CREW-231 follow-up: a Skill tool_result lives under Skills, not Tools', async () => {
    // The Skill tool_use is coalesced into Skills; its paired tool_result must
    // follow it. With only Tools on the Skill result is hidden; with only
    // Skills on it is shown.
    const skillToolUse: TranscriptEvent = {
      type: 'assistant',
      uuid: 'uuid-sk-use',
      timestamp: '2026-04-29T12:00:01Z',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'sk1', name: 'Skill', input: {} }],
        usage: { output_tokens: 0 },
      },
    } as unknown as TranscriptEvent;
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: {
          events: [skillToolUse, userToolResult(2, 'sk1', 'Launching skill: …')],
        },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" />);
    await openFilters();
    // Default: Tools on, Skills off. Both Skill rows hidden (tool_use is in
    // Skills, tool_result now follows it).
    expect(screen.queryAllByTestId('transcript-row')).toHaveLength(0);
    // Turn Skills on — both the Skill invocation and its result appear.
    await userEvent.click(screen.getByLabelText('Skills'));
    const rows = screen.getAllByTestId('transcript-row');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveAttribute('data-category', 'hooks-and-skills');
    }
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

  // CREW-234: a full run → fix-pr lifecycle. The transition log re-flips
  // pr_open → running when fix-pr starts, so the timeline must render three
  // distinct segments — running, pr_open, running — with each phase's events
  // landing in its own section (fix-pr reads as its own running segment).
  it('renders distinct running/pr_open/running segments across a fix-pr cycle', () => {
    const transitions: StateTransition[] = [
      { from: 'running', to: 'pr_open', ts: Date.parse('2026-04-29T12:00:01.5Z') },
      { from: 'pr_open', to: 'running', ts: Date.parse('2026-04-29T12:00:02.5Z') },
    ];
    mockUseTimeline.mockReturnValue(
      timelineResult({
        // evt(1)@:01 → leading running; evt(2)@:02 → pr_open; evt(3)@:03 → fix-pr running.
        data: { events: [evt(1), evt(2), evt(3)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    mockUseStateHistory.mockReturnValue(stateHistoryResult(transitions));
    render(<Timeline agentKey="KAN-1" agentState="running" />);
    const sections = screen.getAllByTestId('timeline-section');
    expect(sections.map((s) => s.getAttribute('data-state'))).toEqual([
      'running',
      'pr_open',
      'running',
    ]);
    // Each phase owns exactly its own event — the fix-pr run is its own segment.
    for (const section of sections) {
      expect(section.querySelectorAll('[data-testid="transcript-row"]')).toHaveLength(1);
    }
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

  it('pins the toolbar with position: sticky below the condensed header', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" agentState="running" />);
    const toolbar = screen.getByTestId('timeline-toolbar');
    expect(toolbar.className).toContain('sticky');
    expect(toolbar.className).toContain('bg-card');
  });

  it('owns no scroll viewport — the drawer body is the single scroll container', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    const { container } = render(<Timeline agentKey="KAN-1" agentState="running" />);
    expect(container.querySelectorAll('[class*="overflow-y-auto"]').length).toBe(0);
  });

  it('live mode autoscrolls the outer scroll container when new events arrive', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1)] },
        isSuccess: true,
        status: 'success',
      }),
    );

    const scrollRef = { current: null as HTMLDivElement | null };
    // Factory, not a shared element — rerendering an identical element
    // reference makes React bail out of the subtree.
    const ui = () => (
      <div
        ref={(el) => {
          scrollRef.current = el;
        }}
        style={{ overflowY: 'auto', height: 800 }}
      >
        <Timeline agentKey="KAN-1" agentState="running" scrollContainerRef={scrollRef} />
      </div>
    );

    const { rerender } = render(ui());
    const el = scrollRef.current!;
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 4000 });
    let scrollTop = 0;
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });

    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    rerender(ui());
    expect(scrollTop).toBe(4000);
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

describe('Timeline filter persistence (CREW-232)', () => {
  const persistEvents = {
    data: { events: [evt(1), assistantThinking(2, 'pondering')] },
    isSuccess: true as const,
    status: 'success' as const,
  };

  beforeEach(() => {
    sessionStorage.clear();
    mockUseTimeline.mockReset();
    mockUseStateHistory.mockReset();
    mockUseStateHistory.mockReturnValue(stateHistoryResult([]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('restores a toggled filter when the same agent reopens', async () => {
    mockUseTimeline.mockReturnValue(timelineResult(persistEvents));
    const { unmount } = render(<Timeline agentKey="KAN-PERSIST" />);
    // Thinking is off by default → only the conversation row renders.
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(1);
    await openFilters();
    await userEvent.click(screen.getByLabelText('Thinking'));
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(2);
    unmount();

    mockUseTimeline.mockReturnValue(timelineResult(persistEvents));
    render(<Timeline agentKey="KAN-PERSIST" />);
    // Persisted: Thinking stays on across the remount.
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(2);
  });

  it('restores the search box for the same agent', async () => {
    mockUseTimeline.mockReturnValue(timelineResult(persistEvents));
    const { unmount } = render(<Timeline agentKey="KAN-SEARCH" />);
    await userEvent.type(screen.getByRole('searchbox'), 'pondering');
    unmount();

    mockUseTimeline.mockReturnValue(timelineResult(persistEvents));
    render(<Timeline agentKey="KAN-SEARCH" />);
    expect(screen.getByRole('searchbox')).toHaveValue('pondering');
  });

  it('uses defaults for a different agent key', async () => {
    mockUseTimeline.mockReturnValue(timelineResult(persistEvents));
    const { unmount } = render(<Timeline agentKey="KAN-A" />);
    await openFilters();
    await userEvent.click(screen.getByLabelText('Thinking'));
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(2);
    unmount();

    mockUseTimeline.mockReturnValue(timelineResult(persistEvents));
    render(<Timeline agentKey="KAN-B" />);
    // A different agent gets the curated defaults — Thinking back off.
    expect(screen.getAllByTestId('transcript-row')).toHaveLength(1);
  });

  // The drawer is rendered without a React key (App.tsx), so navigating between
  // two agents reuses this Timeline instance — the agentKey prop changes but the
  // component is NOT remounted. Filters must re-seed from the new agent rather
  // than leak the previous agent's state (and persist it under the wrong key).
  it('re-seeds filters when the agent key changes without a remount', async () => {
    mockUseTimeline.mockReturnValue(timelineResult(persistEvents));
    const { rerender } = render(<Timeline agentKey="KAN-REUSE-A" />);
    await userEvent.type(screen.getByRole('searchbox'), 'pondering');
    expect(screen.getByRole('searchbox')).toHaveValue('pondering');

    // Same instance, new agent — mirrors the unkeyed drawer swapping agents.
    rerender(<Timeline agentKey="KAN-REUSE-B" />);
    expect(screen.getByRole('searchbox')).toHaveValue('');
    // The previous agent's search must not have been persisted under the new key.
    const storedB = sessionStorage.getItem('crew:timeline-filters:KAN-REUSE-B');
    expect(storedB === null || JSON.parse(storedB).search === '').toBe(true);

    // Switching back restores the first agent's persisted search.
    rerender(<Timeline agentKey="KAN-REUSE-A" />);
    expect(screen.getByRole('searchbox')).toHaveValue('pondering');
  });
});

describe('eventKey', () => {
  it('is stable across calls for a startup event (no uuid/timestamp, has startedAt)', () => {
    const startupEvent = {
      type: 'system',
      subtype: 'crew_startup_docker',
      status: 'completed',
      startedAt: '2026-06-05T12:00:00.000Z',
      summary: 'docker up',
    } as unknown as Parameters<typeof eventKey>[0];
    // Deterministic: two calls return the same key (no Math.random fragment),
    // and it falls back to the startedAt value rather than a random string.
    expect(eventKey(startupEvent, 3)).toBe(eventKey(startupEvent, 3));
    expect(eventKey(startupEvent, 3)).toBe('2026-06-05T12:00:00.000Z');
  });

  it('prefers uuid, then timestamp, then startedAt', () => {
    expect(eventKey({ uuid: 'u1', timestamp: 't1' } as never, 0)).toBe('u1');
    expect(eventKey({ timestamp: 't1' } as never, 0)).toBe('t1');
    expect(eventKey({ startedAt: 's1' } as never, 0)).toBe('s1');
  });

  it('falls back to a deterministic type:index key when no id field exists', () => {
    expect(eventKey({ type: 'unknown' } as never, 7)).toBe('unknown:7');
  });
});
