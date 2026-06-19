import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { DrawerHeader } from './DrawerHeader.js';
import type { AgentDetail, AgentState } from '../data/types.js';

import type * as QueriesModule from '../data/queries.js';

vi.mock('../data/queries.js', async (importOriginal) => {
  const actual = await importOriginal<typeof QueriesModule>();
  return {
    ...actual,
    useRefreshPrStatus: vi.fn(),
    useOverrideState: vi.fn(),
  };
});
import { useRefreshPrStatus, useOverrideState } from '../data/queries.js';
const mockedUseRefreshPrStatus = vi.mocked(useRefreshPrStatus);
const mockedUseOverrideState = vi.mocked(useOverrideState);

function makeMutation(overrides: Partial<{ isPending: boolean; mutate: () => void }> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    data: undefined,
    error: null,
    reset: vi.fn(),
    variables: undefined,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    status: 'idle',
    submittedAt: 0,
    context: undefined,
    ...overrides,
  } as never;
}

afterEach(() => {
  mockedUseRefreshPrStatus.mockReset();
  mockedUseOverrideState.mockReset();
});

function wrap(ui: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function makeDetail(overrides: Partial<AgentDetail> = {}): AgentDetail {
  return {
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
    runs: [
      {
        id: 'r1',
        command: 'run',
        started_at: '2026-05-22T14:30:00Z',
        completed_at: null,
        doc_load_coverage_pct: null,
        cleanliness_pass: null,
        pr_claim_input_tokens: null,
        parity_violations: null,
      },
    ],
    tokens: {
      total: 48_000,
      input: 30_000,
      output: 5_000,
      cache_read: 10_000,
      cache_creation: 3_000,
    },
    tool_call_count: 12,
    ...overrides,
  };
}

describe('DrawerHeader', () => {
  beforeEach(() => {
    mockedUseRefreshPrStatus.mockReturnValue(makeMutation());
    mockedUseOverrideState.mockReturnValue(makeMutation());
  });

  it('renders project + ticket key + state badge in the breadcrumb', () => {
    render(<DrawerHeader detail={makeDetail()} showCloseButton showOpenAsPage />);
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getAllByText(/KAN-23/).length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/running/i),
    );
  });

  it('renders the ticket title as the heading', () => {
    render(<DrawerHeader detail={makeDetail()} showCloseButton={false} showOpenAsPage={false} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Drag-and-drop reordering keeps stale board state',
    );
  });

  it('falls back to ticket_key when ticket_title is null', () => {
    render(
      <DrawerHeader
        detail={makeDetail({ ticket_title: null })}
        showCloseButton={false}
        showOpenAsPage={false}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('KAN-23');
  });

  it('renders all three meta-row pills when fields are present', () => {
    render(<DrawerHeader detail={makeDetail()} showCloseButton={false} showOpenAsPage={false} />);
    expect(screen.getByRole('link', { name: /localhost:7421/ })).toBeInTheDocument();
    const jiraLink = screen.getByRole('link', { name: /KAN-23/ });
    expect(jiraLink).toHaveAttribute('href', 'https://safturento.atlassian.net/browse/KAN-23');
    expect(screen.getByText(/\.worktrees\/KAN-23/)).toBeInTheDocument();
  });

  it('hides app_url pill when app_url is null', () => {
    render(
      <DrawerHeader
        detail={makeDetail({ app_url: null })}
        showCloseButton={false}
        showOpenAsPage={false}
      />,
    );
    expect(screen.queryByRole('link', { name: /localhost/ })).not.toBeInTheDocument();
  });

  it('hides jira_url pill when jira_url is null', () => {
    render(
      <DrawerHeader
        detail={makeDetail({ jira_url: null })}
        showCloseButton={false}
        showOpenAsPage={false}
      />,
    );
    expect(screen.queryByRole('link', { name: /KAN-23/ })).not.toBeInTheDocument();
  });

  it('renders Provide-input pill only when state is `waiting`', () => {
    const { rerender } = render(
      <DrawerHeader detail={makeDetail({ state: 'running' })} showCloseButton showOpenAsPage />,
    );
    expect(screen.queryByRole('button', { name: /provide input/i })).not.toBeInTheDocument();

    rerender(
      <DrawerHeader
        detail={makeDetail({ state: 'waiting' as AgentState })}
        showCloseButton
        showOpenAsPage
      />,
    );
    expect(screen.getByRole('button', { name: /provide input/i })).toBeInTheDocument();
  });

  it('renders X close button when showCloseButton=true and calls onClose on click', () => {
    const onClose = vi.fn();
    render(
      <DrawerHeader
        detail={makeDetail()}
        showCloseButton
        showOpenAsPage={false}
        onClose={onClose}
      />,
    );
    const x = screen.getByRole('button', { name: /close drawer/i });
    x.click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('hides X close button when showCloseButton=false', () => {
    render(<DrawerHeader detail={makeDetail()} showCloseButton={false} showOpenAsPage={false} />);
    expect(screen.queryByRole('button', { name: /close drawer/i })).not.toBeInTheDocument();
  });

  it('renders Open-as-page link only when showOpenAsPage=true', () => {
    const { rerender } = render(
      <DrawerHeader detail={makeDetail()} showCloseButton={false} showOpenAsPage />,
    );
    expect(screen.getByRole('link', { name: /open as page/i })).toBeInTheDocument();

    rerender(<DrawerHeader detail={makeDetail()} showCloseButton={false} showOpenAsPage={false} />);
    expect(screen.queryByRole('link', { name: /open as page/i })).not.toBeInTheDocument();
  });
});

describe('DrawerHeader — Refresh PR + Merged PR (CREW-202)', () => {
  beforeEach(() => {
    mockedUseRefreshPrStatus.mockReturnValue(makeMutation());
    mockedUseOverrideState.mockReturnValue(makeMutation());
  });

  it('shows a Refresh PR button when state is pr_open and pr_url is set', () => {
    render(
      wrap(
        <DrawerHeader
          detail={makeDetail({ state: 'pr_open', pr_url: 'https://example.com/pr/1' })}
          showCloseButton={false}
          showOpenAsPage={false}
        />,
      ),
    );
    expect(screen.getByRole('button', { name: /refresh pr/i })).toBeInTheDocument();
  });

  it('hides Refresh PR button when state is pr_merged', () => {
    render(
      wrap(
        <DrawerHeader
          detail={makeDetail({ state: 'pr_merged', pr_url: 'https://example.com/pr/2' })}
          showCloseButton={false}
          showOpenAsPage={false}
        />,
      ),
    );
    expect(screen.queryByRole('button', { name: /refresh pr/i })).not.toBeInTheDocument();
  });

  it('hides Refresh PR button when pr_url is null (no PR to refresh)', () => {
    render(
      wrap(
        <DrawerHeader
          detail={makeDetail({ state: 'pr_open', pr_url: null })}
          showCloseButton={false}
          showOpenAsPage={false}
        />,
      ),
    );
    expect(screen.queryByRole('button', { name: /refresh pr/i })).not.toBeInTheDocument();
  });

  it('shows "View merged PR" pill (lucide/git-merge) when state is pr_merged', () => {
    render(
      wrap(
        <DrawerHeader
          detail={makeDetail({ state: 'pr_merged', pr_url: 'https://example.com/pr/9' })}
          showCloseButton={false}
          showOpenAsPage={false}
        />,
      ),
    );
    const link = screen.getByRole('link', { name: /view merged pr/i });
    expect(link).toHaveAttribute('href', 'https://example.com/pr/9');
    expect(link.querySelector('svg')?.classList.toString()).toMatch(/lucide-git-merge/);
  });

  it('clicking Refresh PR fires the mutation', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    mockedUseRefreshPrStatus.mockReturnValue(makeMutation({ mutate }));

    render(
      wrap(
        <DrawerHeader
          detail={makeDetail({ state: 'pr_open', pr_url: 'https://example.com/pr/1' })}
          showCloseButton={false}
          showOpenAsPage={false}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: /refresh pr/i }));
    expect(mutate).toHaveBeenCalled();
  });

  it('disables Refresh PR while the mutation is in flight', () => {
    mockedUseRefreshPrStatus.mockReturnValue(makeMutation({ isPending: true }));
    render(
      wrap(
        <DrawerHeader
          detail={makeDetail({ state: 'pr_open', pr_url: 'https://example.com/pr/1' })}
          showCloseButton={false}
          showOpenAsPage={false}
        />,
      ),
    );
    expect(screen.getByRole('button', { name: /refresh pr/i })).toBeDisabled();
  });
});
