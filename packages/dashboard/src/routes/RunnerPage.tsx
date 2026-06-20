import type { Agent } from '../data/types.js';
import {
  useArchiveFailedStart,
  useCancelRun,
  useDequeue,
  useForceKill,
  usePauseRun,
  useReap,
  useResumeRun,
} from '../data/runnerControls.js';
import { FailedToStartSection } from '../components/runner/FailedToStartSection.js';
import { LiveProcessList } from '../components/runner/LiveProcessList.js';
import { QueuedActions } from '../components/runner/QueuedActions.js';
import { RecentlyEnded } from '../components/runner/RecentlyEnded.js';
import { SupervisorCard } from '../components/runner/SupervisorCard.js';
import { UnmanagedRuns } from '../components/runner/UnmanagedRuns.js';
import { useRunnerPageData } from '../components/runner/useRunnerPageData.js';

interface RunnerPageProps {
  agents: Agent[];
  /** Page-level loading — drives the Live processes skeleton instead of a blank. */
  loading?: boolean;
}

/**
 * The Runner page (`#/runner`). Top-to-bottom: Supervisor, the Failed-to-start
 * attention queue, Live processes, Unmanaged runs, Queued actions, Recently
 * ended. Every row renders through the shared `Row`; the control verbs
 * (Cancel/Force kill/Reap/Dequeue/Archive) route through the runner command
 * hooks. See `useRunnerPageData` for which sections are live-wired today.
 */
export function RunnerPage({ agents, loading = false }: RunnerPageProps) {
  const data = useRunnerPageData(agents);
  const cancel = useCancelRun();
  const forceKill = useForceKill();
  const pause = usePauseRun();
  const resume = useResumeRun();
  const reap = useReap();
  const dequeue = useDequeue();
  const archive = useArchiveFailedStart();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Runner</h1>
        <p className="text-sm text-muted-foreground">
          Supervisor process, live agent subprocesses, and run-lifecycle controls.
        </p>
      </div>

      <SupervisorCard supervisor={data.supervisor} />
      <FailedToStartSection failures={data.failedToStart} onArchive={(k) => archive.mutate(k)} />
      <LiveProcessList
        processes={data.liveProcesses}
        loading={loading}
        onCancel={(k) => cancel.mutate(k)}
        onForceKill={(k) => forceKill.mutate(k)}
        onPause={(k) => pause.mutate(k)}
        onResume={(k, message) => resume.mutate({ agentKey: k, message })}
      />
      <UnmanagedRuns runs={data.unmanaged} onReap={(k) => reap.mutate(k)} />
      <QueuedActions actions={data.queued} onDequeue={(k) => dequeue.mutate(k)} />
      <RecentlyEnded runs={data.recentlyEnded} />
    </div>
  );
}
