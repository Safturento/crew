import { useMemo } from 'react';
import type { LiveProcess } from 'crew-shared';

import type { Agent } from '@/data/types';
import { useRunnerStatus } from '@/data/useRunnerStatus';
import type {
  EndedRunView,
  FailedStartView,
  QueuedActionView,
  SupervisorView,
  UnmanagedView,
} from './types.js';

export interface RunnerPageData {
  supervisor: SupervisorView;
  liveProcesses: LiveProcess[];
  unmanaged: UnmanagedView[];
  failedToStart: FailedStartView[];
  queued: QueuedActionView[];
  recentlyEnded: EndedRunView[];
}

const ACTIVE_STATES = new Set<Agent['state']>(['running', 'initializing']);

/**
 * Aggregates the Runner page's data from what the merged daemon serves today:
 *
 * - Supervisor + live processes come from `/api/runner/status` (online/lastSeen
 *   + the snapshot, kept live over `runner.snapshot_changed`).
 * - Unmanaged is derived honestly client-side: agents `running`/`initializing`
 *   in the DB whose key is absent from the live snapshot — exactly the spec's
 *   "running in the DB, no live process".
 *
 * Failed-to-start / Queued / Recently-ended have no read endpoint on the merged
 * daemon yet (the claim route mutates; failed-start runs aren't agents), so
 * they return empty until the CREW-249 per-entity read surfaces land. The
 * section components render fully from these arrays — only the source is
 * deferred. See docs/followups.md.
 */
export function useRunnerPageData(agents: Agent[]): RunnerPageData {
  const runner = useRunnerStatus();

  return useMemo(() => {
    const liveKeys = new Set(runner.processes.map((p) => p.agentKey));
    const unmanaged: UnmanagedView[] = agents
      .filter((a) => ACTIVE_STATES.has(a.state) && !liveKeys.has(a.key))
      .map((a) => ({ key: a.key, project: a.projectName, startedAt: a.startedAt }));

    return {
      supervisor: { online: runner.online, lastSeen: runner.lastSeen },
      liveProcesses: runner.processes,
      unmanaged,
      failedToStart: [],
      queued: [],
      recentlyEnded: [],
    };
  }, [runner.online, runner.lastSeen, runner.processes, agents]);
}
