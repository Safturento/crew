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
import { ProjectsListPage } from './routes/ProjectsListPage.js';
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
        return <ProjectsListPage projects={projects} />;
      case 'agent-drawer':
      case 'agents-list':
      default:
        return (
          <AgentsList
            projects={projects}
            agents={agents}
            onSelectAgent={(key) => navigate(`/agent/${key}`)}
            onOpenProject={(name) => navigate(`/projects/${name}`)}
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

