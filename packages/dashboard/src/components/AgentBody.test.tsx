import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentBody } from './AgentBody.js';
import { useAgent } from '../data/queries.js';
import type { AgentDetail } from '../data/types.js';

vi.mock('../data/queries.js', () => ({
  useAgent: vi.fn(),
  useRefreshPrStatus: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock('../data/useFinishSteps.js', () => ({
  useFinishSteps: vi.fn(() => []),
}));
// Timeline pulls its own queries; its internals are covered by Timeline.test.tsx.
vi.mock('./Timeline/Timeline.js', () => ({
  Timeline: () => <div data-testid="timeline-stub" />,
}));

const mockUseAgent = vi.mocked(useAgent);

const DETAIL: AgentDetail = {
  key: 'kanban-api/KAN-23',
  project: 'kanban-api',
  ticket_key: 'KAN-23',
  ticket_title: 'Drag-and-drop reordering keeps stale board state',
  state: 'running',
  worktree_path: '~/code/kanban-api/.worktrees/KAN-23',
  pr_url: null,
  app_url: 'http://localhost:7421',
  jira_url: 'https://safturento.atlassian.net/browse/KAN-23',
  tokens_by_tool: [],
  model: '',
  runs: [],
  tokens: { total: 48_000, input: 0, output: 0, cache_read: 0, cache_creation: 0 },
  tool_call_count: 0,
};

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly options?: IntersectionObserverInit;
  observed: Element[] = [];
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.observed.push(el);
  }
  unobserve(): void {}
  disconnect(): void {}
  fire(isIntersecting: boolean): void {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

describe('AgentBody condensed header', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    mockUseAgent.mockReturnValue({
      data: DETAIL,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAgent>);
  });

  const lastObserver = () => MockIntersectionObserver.instances.at(-1)!;

  it('observes the drawer-header sentinel with the scroll container as root', () => {
    render(<AgentBody agentKey="kanban-api/KAN-23" mode="drawer" />);
    const io = lastObserver();
    expect(io.observed).toContain(screen.getByTestId('drawer-header-sentinel'));
    expect(io.options?.root).toBe(screen.getByTestId('agent-scroll-container'));
  });

  it('is hidden at rest and appears once the sentinel scrolls out of view', () => {
    render(<AgentBody agentKey="kanban-api/KAN-23" mode="drawer" />);
    expect(screen.queryByTestId('condensed-header')).not.toBeInTheDocument();

    act(() => lastObserver().fire(false));
    expect(screen.getByTestId('condensed-header')).toBeInTheDocument();

    act(() => lastObserver().fire(true));
    expect(screen.queryByTestId('condensed-header')).not.toBeInTheDocument();
  });

  it('gates the close button by mode', () => {
    const { rerender } = render(<AgentBody agentKey="kanban-api/KAN-23" mode="full" />);
    act(() => lastObserver().fire(false));
    expect(screen.queryByRole('button', { name: 'Close drawer' })).not.toBeInTheDocument();

    rerender(<AgentBody agentKey="kanban-api/KAN-23" mode="drawer" />);
    act(() => lastObserver().fire(false));
    // Both the full DrawerHeader and the condensed header render one
    expect(screen.getAllByRole('button', { name: 'Close drawer' }).length).toBeGreaterThan(0);
  });
});
