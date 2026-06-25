import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { Toaster } from 'sonner';

import { useAttention } from './attention/useAttention.js';
import { useFaviconBadge } from './attention/useFaviconBadge.js';
import { AgentsList } from './components/AgentsList.js';
import type { QuickActionKind } from './components/AgentRow.js';
import { ErrorFallback } from './components/ErrorFallback.js';
import { FixPrModal } from './components/FixPrModal.js';
import { NewRunModal } from './components/NewRunModal.js';
import { TopNav } from './components/TopNav.js';
import { ViewportFrame } from './components/ViewportFrame.js';
import { useActionToasts, useEnqueueAction } from './data/actions.js';
import type { DaemonClient } from './data/DaemonClient.js';
import { HttpDaemonClient } from './data/HttpDaemonClient.js';
import type { Agent } from './data/types.js';
import { useRunnerStatus } from './data/useRunnerStatus.js';
import { AgentDrawer } from './routes/AgentDrawer.js';
import { AgentFullPage } from './routes/AgentFullPage.js';
import { ProjectDetailPage } from './routes/ProjectDetailPage.js';
import { ProjectsListPage } from './routes/ProjectsListPage.js';
import { RunnerPage } from './routes/RunnerPage.js';
import { navigate, useHashRoute } from './routing/useHashRoute.js';

const defaultClient: DaemonClient = new HttpDaemonClient();

export function App({ client = defaultClient }: { client?: DaemonClient } = {}) {
  const { reset } = useQueryErrorResetBoundary();
  return (
    <ViewportFrame>
      <ErrorBoundary FallbackComponent={ErrorFallback} onReset={reset}>
        <AppContent client={client} />
      </ErrorBoundary>
      <Toaster theme="dark" position="bottom-right" richColors />
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

  // CREW-232: the agent drawer is a Radix Dialog whose `open` is derived from
  // the route. We retain the last agentKey while `open` is false so the
  // slide-out animation still has a body to render as it animates closed
  // (Radix keeps the content mounted until the close animation ends). The
  // setState-during-render mirrors Timeline's `seededFor` re-seed pattern.
  const drawerOpen = route.kind === 'agent-drawer';
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  if (drawerOpen && route.key !== drawerKey) {
    setDrawerKey(route.key);
  }

  // CREW-217: the action layer. `useActionToasts` surfaces the runner's
  // launch outcome (failed/launched) over SSE; `useRunnerStatus` drives the
  // no-runner degradation; `onAgentAction` finally backs the QuickAction
  // thread (AgentRow → ProjectSection → AgentsList). Resume → `resume`
  // (CREW-275: continues an interrupted run on its existing worktree),
  // Finish → `finish`; the other QuickActions belong to later tickets.
  const runner = useRunnerStatus();
  const enqueue = useEnqueueAction();
  useActionToasts();

  // CREW-218: the "+ New Run" stepper modal. App owns the open state + the
  // enqueue mutation; NewRunModal is presentational.
  const [newRunOpen, setNewRunOpen] = useState(false);

  // CREW-219: Fix PR can't fire on click — it needs a comment first. The
  // QuickAction opens this modal; submitting it enqueues the fix_pr action
  // carrying the comment. Holding the target agent keeps the modal a pure
  // presentational child.
  const [fixPrAgent, setFixPrAgent] = useState<Agent | null>(null);

  const onAgentAction = useCallback(
    (kind: QuickActionKind, agent: Agent) => {
      if (kind === 'resume') {
        // CREW-275: continue an interrupted run on its existing worktree.
        enqueue.mutate({ kind: 'resume', project: agent.projectName, ticketKey: agent.key });
      } else if (kind === 'finish') {
        enqueue.mutate({ kind: 'finish', project: agent.projectName, ticketKey: agent.key });
      } else if (kind === 'fix-pr') {
        setFixPrAgent(agent);
      }
    },
    [enqueue],
  );

  const body = useMemo(() => {
    switch (route.kind) {
      case 'agent-full':
        return <AgentFullPage agentKey={route.key} />;
      case 'project-detail':
        return <ProjectDetailPage slug={route.slug} />;
      case 'projects':
        return <ProjectsListPage projects={projects} />;
      case 'runner':
        return <RunnerPage agents={agents} loading={agentsQuery.isLoading} />;
      case 'agent-drawer':
      case 'agents-list':
      default:
        return (
          <AgentsList
            projects={projects}
            agents={agents}
            onSelectAgent={(key) => navigate(`/agent/${key}`)}
            onAgentAction={onAgentAction}
            onOpenProject={(name) => navigate(`/projects/${name}`)}
            runnerOnline={runner.online}
          />
        );
    }
  }, [route, projects, agents, onAgentAction, runner.online, agentsQuery.isLoading]);

  return (
    <>
      <TopNav
        route={route}
        attentionCount={attention.count}
        onClearAttention={attention.clear}
        onNewRun={() => setNewRunOpen(true)}
      />
      <div className="flex-1 overflow-y-auto">{body}</div>
      <NewRunModal
        open={newRunOpen}
        onOpenChange={setNewRunOpen}
        projects={projects}
        client={client}
        onConfirm={({ project, ticketKey }) => enqueue.mutate({ kind: 'run', project, ticketKey })}
      />
      {drawerKey !== null && (
        <AgentDrawer
          agentKey={drawerKey}
          open={drawerOpen}
          onOpenChange={(open) => {
            if (!open) navigate('/');
          }}
        />
      )}
      {fixPrAgent && (
        <FixPrModal
          agentKey={fixPrAgent.key}
          open
          onOpenChange={(open) => {
            if (!open) setFixPrAgent(null);
          }}
          onSubmit={(comment) =>
            enqueue.mutate({
              kind: 'fix_pr',
              project: fixPrAgent.projectName,
              ticketKey: fixPrAgent.key,
              comment,
            })
          }
        />
      )}
    </>
  );
}
