import type { LiveProcess } from 'crew-shared';

import { Section } from './Section.js';
import { ProcessRow } from './ProcessRow.js';
import { EmptyRow, SkeletonRows } from './rowStates.js';

interface LiveProcessListProps {
  processes: LiveProcess[];
  loading?: boolean;
  onCancel: (key: string) => void;
  onForceKill: (key: string) => void;
  onPause: (key: string) => void;
  onResume: (key: string, message?: string) => void;
}

/**
 * Live processes — the supervisor-held subprocesses from the heartbeat
 * snapshot. Unlike the attention queues this section always renders (it's the
 * page's primary signal): empty → a muted "No agents currently running" row;
 * loading → skeleton rows rather than a blank.
 */
export function LiveProcessList({
  processes,
  loading = false,
  onCancel,
  onForceKill,
  onPause,
  onResume,
}: LiveProcessListProps) {
  return (
    <Section title="Live processes" count={`${processes.length} supervisor-held`}>
      {loading ? (
        <SkeletonRows count={2} />
      ) : processes.length === 0 ? (
        <EmptyRow>No agents currently running</EmptyRow>
      ) : (
        processes.map((p) => (
          <ProcessRow
            key={p.agentKey}
            process={p}
            onCancel={onCancel}
            onForceKill={onForceKill}
            onPause={onPause}
            onResume={onResume}
          />
        ))
      )}
    </Section>
  );
}
