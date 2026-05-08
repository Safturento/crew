import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';

import { Timeline } from './Timeline.js';
import { useTimeline } from '../../data/queries.js';
import type { TranscriptEvent } from '../../data/types.js';

vi.mock('../../data/queries.js', () => ({
  useTimeline: vi.fn(),
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
});
