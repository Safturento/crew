import { Row } from '../Row.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { formatAgo } from '@/format/relativeTime';
import { Section } from './Section.js';
import type { UnmanagedView } from './types.js';

interface UnmanagedRunsProps {
  runs: UnmanagedView[];
  onReap: (key: string) => void;
}

/**
 * Unmanaged runs — `running` in the DB but with no live process in the
 * snapshot ("likely orphaned"). The shared `waiting` accent gives the rows the
 * amber tint; `Reap` force-settles one immediately rather than waiting for the
 * daemon reaper. Hidden when empty.
 */
export function UnmanagedRuns({ runs, onReap }: UnmanagedRunsProps) {
  if (runs.length === 0) return null;

  return (
    <Section
      title="⚠ Unmanaged runs"
      count={runs.length}
      hint="Running in the DB, but the supervisor holds no live process — likely orphaned. The reaper settles these; Reap forces it now."
    >
      {runs.map((r) => (
        <Row
          key={r.key}
          accent="waiting"
          statusSlot={
            <Badge role="status" aria-label="idle" color="idle" intensity="mid">
              idle
            </Badge>
          }
          title={<span className="text-sm font-semibold text-foreground">{r.key}</span>}
          subheader={
            <span className="text-xs text-muted-foreground">
              {r.project} · running {formatAgo(r.startedAt)} · no live process
            </span>
          }
          actions={
            <Button color="waiting" intensity="muted" size="sm" onClick={() => onReap(r.key)}>
              Reap
            </Button>
          }
        />
      ))}
    </Section>
  );
}
