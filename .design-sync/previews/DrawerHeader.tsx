import * as React from 'react';
import { DrawerHeader, QueryClient, QueryClientProvider } from 'crew-dashboard';

// DrawerHeader calls react-query hooks (refresh-PR / cancel / pause
// mutations + the runner-status query), so every cell mounts under a
// QueryClientProvider with network retries disabled.
const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false } },
});

const Providers = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

const startedAt = new Date(Date.now() - 47 * 60_000).toISOString();

const baseDetail = {
  key: 'crew/CREW-295',
  project: 'crew',
  ticket_key: 'CREW-295',
  ticket_title: 'Runner page rework: merge failed starts into the timeline',
  state: 'running',
  worktree_path: '~/Repos/crew-CREW-295',
  pr_url: null as string | null,
  app_url: 'http://localhost:5187',
  jira_url: 'https://safturento.atlassian.net/browse/CREW-295',
  tokens_by_tool: [],
  model: 'claude-sonnet-4-5',
  runs: [
    {
      id: 'run-01',
      command: 'run',
      started_at: startedAt,
      completed_at: null,
      doc_load_coverage_pct: null,
      cleanliness_pass: null,
      pr_claim_input_tokens: null,
      parity_violations: null,
    },
  ],
  tokens: { total: 1_284_000, input: 412_000, output: 96_000, cache_read: 702_000, cache_creation: 74_000 },
  tool_call_count: 118,
};

/** An actively running agent — live runtime, Pause + Cancel controls. */
export const RunningAgent = () => (
  <Providers>
    <DrawerHeader detail={baseDetail} showCloseButton showOpenAsPage onClose={() => {}} />
  </Providers>
);

/** An agent parked on an open PR — Refresh PR control in the action cluster. */
export const PrOpenAgent = () => (
  <Providers>
    <DrawerHeader
      detail={{
        ...baseDetail,
        key: 'crew/CREW-313',
        ticket_key: 'CREW-313',
        ticket_title: 'Dispatch-gate visibility: bracket the pre-spawn tail',
        state: 'pr_open',
        worktree_path: '~/Repos/crew-CREW-313',
        pr_url: 'https://github.com/Safturento/crew/pull/452',
        jira_url: 'https://safturento.atlassian.net/browse/CREW-313',
        runs: [{ ...baseDetail.runs[0], completed_at: new Date().toISOString() }],
        tokens: { total: 2_910_000, input: 880_000, output: 214_000, cache_read: 1_650_000, cache_creation: 166_000 },
      }}
      showCloseButton
      showOpenAsPage
      onClose={() => {}}
    />
  </Providers>
);
