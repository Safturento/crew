import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';

import { Timeline } from './Timeline.js';
import { useStateHistory, useTimeline } from '../../data/queries.js';
import type { StateTransition, TranscriptEvent } from '../../data/types.js';

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

describe('Timeline', () => {
  beforeEach(() => {
    mockUseTimeline.mockReset();
    mockUseStateHistory.mockReset();
    // Default: no transitions — Timeline falls back to a single section.
    mockUseStateHistory.mockReturnValue(stateHistoryResult([]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders one EventCard per event from useTimeline', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2), evt(3)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" />);
    expect(screen.getAllByTestId('event-card')).toHaveLength(3);
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
    expect(screen.getAllByTestId('event-card')).toHaveLength(2);
    await userEvent.type(screen.getByRole('searchbox'), 'bash');
    expect(screen.getAllByTestId('event-card')).toHaveLength(1);
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

  it('shows a "N new events" pill when live mode is OFF and new events arrive', async () => {
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
    expect(screen.getByRole('button', { name: /2 new events/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /2 new events/i }));
    expect(screen.queryByRole('button', { name: /new events/i })).toBeNull();
  });

  it('does not treat chip toggling as new events (no pill on filter change)', async () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), assistantThinking(2, 'pondering')] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" agentState="finished" />);
    expect(screen.queryByRole('button', { name: /new events/i })).toBeNull();
    // Toggle thinking ON — visible event count grows from 1 to 2,
    // but no events arrived from the server, so no pill.
    await userEvent.click(screen.getByRole('button', { name: 'Thinking' }));
    expect(screen.queryByRole('button', { name: /new events/i })).toBeNull();
  });

  it('does not show the new-events pill when live mode is ON', () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    const { rerender } = render(<Timeline agentKey="KAN-1" agentState="running" />);
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), evt(2), evt(3)] },
        isSuccess: true,
        status: 'success',
      }),
    );
    rerender(<Timeline agentKey="KAN-1" agentState="running" />);
    expect(screen.queryByRole('button', { name: /new events/i })).toBeNull();
  });

  it('renders the all-off empty state when every chip is toggled off', async () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), assistantToolUse(2, 'Bash')] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" />);
    for (const label of [
      'Tool calls',
      'Assistant prose',
      'Thinking',
      'System',
      'Hooks & skills',
      'Other',
    ]) {
      const btn = screen.getByRole('button', { name: label });
      if (btn.getAttribute('aria-pressed') === 'true') {
        await userEvent.click(btn);
      }
    }
    expect(screen.getByText(/No events match your filters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show all/i })).toBeInTheDocument();
    expect(screen.queryAllByTestId('event-card')).toHaveLength(0);
  });

  it('clicking "Show all" resets chips to the curated defaults', async () => {
    mockUseTimeline.mockReturnValue(
      timelineResult({
        data: { events: [evt(1), assistantToolUse(2, 'Bash')] },
        isSuccess: true,
        status: 'success',
      }),
    );
    render(<Timeline agentKey="KAN-1" />);
    // Toggle the two default-on chips OFF — produces the empty state.
    await userEvent.click(screen.getByRole('button', { name: 'Tool calls' }));
    await userEvent.click(screen.getByRole('button', { name: 'Assistant prose' }));
    expect(screen.getByText(/No events match your filters/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Show all/i }));
    expect(screen.getByRole('button', { name: 'Tool calls' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Assistant prose' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByTestId('event-card')).toHaveLength(2);
  });

  it('hides events whose chip group is toggled off', async () => {
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
    // Default: tool-calls + assistant-prose ON, thinking OFF — 2 cards.
    expect(screen.getAllByTestId('event-card')).toHaveLength(2);
    // Toggle thinking ON — third card shows.
    await userEvent.click(screen.getByRole('button', { name: 'Thinking' }));
    expect(screen.getAllByTestId('event-card')).toHaveLength(3);
    // Toggle assistant prose OFF — only tool-call + thinking remain.
    await userEvent.click(screen.getByRole('button', { name: 'Assistant prose' }));
    expect(screen.getAllByTestId('event-card')).toHaveLength(2);
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
    expect(sections.map((s) => s.getAttribute('data-state'))).toEqual([
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
    // Sections start open → at least one event-card visible.
    expect(screen.getAllByTestId('event-card').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /collapse all/i }));
    expect(screen.queryAllByTestId('event-card')).toHaveLength(0);
    // Every section's toggle button should be aria-expanded=false.
    const toggles = screen.getAllByRole('button', { name: /toggle/i });
    for (const t of toggles) {
      expect(t).toHaveAttribute('aria-expanded', 'false');
    }
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
    expect(toggles).toHaveLength(2);
    await userEvent.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'false');
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'true');
  });
});
