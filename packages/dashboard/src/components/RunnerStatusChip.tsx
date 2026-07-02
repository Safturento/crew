import { useState } from 'react';

import { useReconcile } from '../data/useReconcile.js';
import { useRunnerStatus } from '../data/useRunnerStatus.js';
import { Badge } from './ui/badge.js';
import { StateIcon } from './ui/state-icon.js';
import { SupervisorDrawer } from './runner/SupervisorDrawer.js';

/**
 * CREW-221 / CREW-311: top-nav runner health chip. Reads `useRunnerStatus()`
 * and renders healthy (green) when a runner is heartbeating, unhealthy
 * (muted) otherwise — the latter being the normal state on a worktree
 * dashboard, which runs no runner. While online it appends the supervised
 * live-process count (`Runner · N live`), and when the reconcile roll-up
 * (CREW-310) reports orphaned agents it carries an amber count badge.
 * Clicking toggles the {@link SupervisorDrawer} — the chip is the drawer's
 * home now that the standalone Runner page is retiring (Epic CREW-306).
 */
export function RunnerStatusChip() {
  const { online, lastSeen, processes } = useRunnerStatus();
  const reconcile = useReconcile();
  const orphanedCount = reconcile.data?.orphaned.length ?? 0;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const health = `Runner ${online ? 'online' : 'offline'}`;
  const anomalies = orphanedCount > 0 ? `, ${orphanedCount} orphaned` : '';

  return (
    <>
      <Badge asChild color={online ? 'pr_merged' : 'idle'} intensity="mid" icon={<StateIcon />}>
        <button
          type="button"
          data-online={online}
          aria-label={`${health}${anomalies} — open supervisor`}
          onClick={() => setDrawerOpen(true)}
        >
          Runner
          {online && processes.length > 0 && ` · ${processes.length} live`}
          {orphanedCount > 0 && (
            <Badge color="waiting" intensity="mid" className="ml-1">
              {orphanedCount}
            </Badge>
          )}
        </button>
      </Badge>
      <SupervisorDrawer
        supervisor={{ online, lastSeen }}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  );
}
