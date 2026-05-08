import { useMemo } from 'react';
import { useQuery, useQueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';

import { useAttention } from './attention/useAttention.js';
import { useFaviconBadge } from './attention/useFaviconBadge.js';
import { AgentsList } from './components/AgentsList.js';
import { ErrorFallback } from './components/ErrorFallback.js';
import { TopNav } from './components/TopNav.js';
import { ViewportFrame } from './components/ViewportFrame.js';
import type { DaemonClient } from './data/DaemonClient.js';
import { HttpDaemonClient } from './data/HttpDaemonClient.js';
import { AgentDrawer } from './routes/AgentDrawer.js';
import { AgentFullPage } from './routes/AgentFullPage.js';
import { navigate, useHashRoute } from './routing/useHashRoute.js';

const defaultClient: DaemonClient = new HttpDaemonClient();

export function App({ client = defaultClient }: { client?: DaemonClient } = {}) {
  const { reset } = useQueryErrorResetBoundary();
  return (
    <ViewportFrame>
      <ErrorBoundary FallbackComponent={ErrorFallback} onReset={reset}>
        <AppContent client={client} />
      </ErrorBoundary>
    </ViewportFrame>
  );
}

function AppContent({ client }: { client: DaemonClient }) {
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => client.listProjects(),
    refetchInterval: 2000,
  });
  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: () => client.listAgents(),
    refetchInterval: 2000,
  });

  const projects = projectsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];

  const route = useHashRoute();
  const attention = useAttention(agents);
  useFaviconBadge(attention.count);

  const body = useMemo(() => {
    switch (route.kind) {
      case 'agent-full':
        return <AgentFullPage agentKey={route.key} />;
      case 'projects':
        return <ProjectsPlaceholder />;
      case 'agent-drawer':
      case 'agents-list':
      default:
        return (
          <AgentsList
            projects={projects}
            agents={agents}
            onSelectAgent={(key) => navigate(`/agent/${key}`)}
          />
        );
    }
  }, [route, projects, agents]);

  return (
    <>
      <TopNav
        route={route}
        attentionCount={attention.count}
        onClearAttention={attention.clear}
        onNewRun={() => {
          /* New Run modal lands in a future plan */
        }}
      />
      <div className="flex-1 overflow-y-auto">{body}</div>
      {route.kind === 'agent-drawer' && <AgentDrawer agentKey={route.key} />}
    </>
  );
}

function ProjectsPlaceholder() {
  return (
    <div className="mx-auto w-full max-w-[1240px] p-6">
      <div className="rounded-[14px] border border-white/10 bg-surface px-6 py-8">
        <p className="font-mono text-xs text-text-3">PROJECTS</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-text">Projects</p>
        <p className="mt-3 text-sm text-text-2">The projects route ships in a follow-up plan.</p>
      </div>
    </div>
  );
}
