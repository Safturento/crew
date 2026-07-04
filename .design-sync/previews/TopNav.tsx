import * as React from 'react';
import { QueryClient, QueryClientProvider, TopNav } from 'crew-dashboard';

// TopNav's RunnerStatusChip reads the runner-status query, so each cell
// mounts under a QueryClientProvider with network retries disabled. Without
// a live daemon the chip renders its safe default: "Runner" offline (muted).
const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false } },
});

/** Agents tab active with pending attention items — the badge counts them. */
export const AgentsViewWithAttention = () => (
  <QueryClientProvider client={qc}>
    <TopNav
      route={{ kind: 'agents-list' }}
      attentionCount={3}
      onClearAttention={() => {}}
      onNewRun={() => {}}
    />
  </QueryClientProvider>
);

/** Projects tab active, nothing needing attention — Clear attention disabled. */
export const ProjectsView = () => (
  <QueryClientProvider client={qc}>
    <TopNav
      route={{ kind: 'projects' }}
      attentionCount={0}
      onClearAttention={() => {}}
      onNewRun={() => {}}
    />
  </QueryClientProvider>
);
