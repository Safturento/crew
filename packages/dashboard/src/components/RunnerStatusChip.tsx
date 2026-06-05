import { useState } from 'react';

import { useRunnerStatus } from '../data/useRunnerStatus.js';
import { Badge } from './ui/badge.js';
import { StateIcon } from './ui/state-icon.js';
import { RunnerLogViewer } from './RunnerLogViewer.js';

/**
 * CREW-221: top-nav runner health chip. Reads `useRunnerStatus()` and renders
 * healthy (green) when a runner is heartbeating, unhealthy (muted) otherwise —
 * the latter being the normal state on a worktree dashboard, which runs no
 * runner. Clicking opens the {@link RunnerLogViewer} to tail the runner log.
 */
export function RunnerStatusChip() {
  const { online } = useRunnerStatus();
  const [logsOpen, setLogsOpen] = useState(false);

  return (
    <>
      <Badge asChild color={online ? 'pr_merged' : 'idle'} intensity="mid" icon={<StateIcon />}>
        <button
          type="button"
          data-online={online}
          aria-label={`Runner ${online ? 'online' : 'offline'} — open logs`}
          onClick={() => setLogsOpen(true)}
        >
          Runner
        </button>
      </Badge>
      <RunnerLogViewer open={logsOpen} onOpenChange={setLogsOpen} />
    </>
  );
}
