import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

import { AgentFullPage } from './AgentFullPage.js';
import { defaultClient } from '../data/queries.js';
import type { AgentDetail, TranscriptEvent } from '../data/types.js';
import { renderWithProviders } from '../test/renderWithProviders.js';

const SAMPLE_DETAIL: AgentDetail = {
  key: 'KAN-1',
  project: 'kanban-api',
  ticket_key: 'KAN-1',
  ticket_title: 'Add board archival',
  state: 'running',
  worktree_path: '/repos/kanban-api-KAN-1',
  pr_url: null,
  app_url: null,
  jira_url: null,
  tokens_by_tool: [],
  runs: [
    {
      id: '1',
      command: 'run',
      started_at: '2026-04-29T12:00:00Z',
      completed_at: null,
      doc_load_coverage_pct: null,
      cleanliness_pass: null,
      pr_claim_input_tokens: null,
      parity_violations: null,
    },
  ],
  tokens: { total: 4_000, input: 1, output: 1, cache_read: 1, cache_creation: 1 },
  tool_call_count: 0,
};

beforeEach(() => {
  vi.spyOn(defaultClient, 'getAgent').mockResolvedValue(SAMPLE_DETAIL);
  vi.spyOn(defaultClient, 'getTimeline').mockResolvedValue({ events: [] as TranscriptEvent[] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AgentFullPage', () => {
  it('renders the shared AgentBody header without drawer chrome', async () => {
    renderWithProviders(<AgentFullPage agentKey="KAN-1" />);

    expect(await screen.findByTestId('drawer-header')).toBeInTheDocument();
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('Add board archival')).toBeInTheDocument();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close drawer/i })).not.toBeInTheDocument();
  });

  it('omits the Open as page link (already there)', async () => {
    renderWithProviders(<AgentFullPage agentKey="KAN-1" />);
    await screen.findByTestId('drawer-header');
    expect(screen.queryByRole('link', { name: /open as page/i })).not.toBeInTheDocument();
  });

  it('renders the Timeline inside the body slot', async () => {
    renderWithProviders(<AgentFullPage agentKey="KAN-1" />);
    expect(await screen.findByTestId('agent-body')).toBeInTheDocument();
    expect(await screen.findByTestId('timeline-empty')).toBeInTheDocument();
  });
});
