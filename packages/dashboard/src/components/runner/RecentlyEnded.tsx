import { useState } from 'react';
import { GitPullRequest } from 'lucide-react';

import type { PillColor } from '@/lib/pill-variants';
import { Row } from '../Row.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { formatAgo } from '@/format/relativeTime';
import { CommandBadge } from './CommandBadge.js';
import { RunDrawer } from './RunDrawer.js';
import { EmptyRow } from './rowStates.js';
import { Section } from './Section.js';
import type { EndedKind, EndedRunView } from './types.js';

interface RecentlyEndedProps {
  runs: EndedRunView[];
}

const PILL: Record<EndedKind, { label: string; color: PillColor }> = {
  finished: { label: 'finished', color: 'finished' },
  cancelled: { label: 'cancelled', color: 'idle' },
  error: { label: 'error', color: 'error' },
  'failed-start': { label: 'failed', color: 'error' },
};

const SUFFIX: Record<EndedKind, string> = {
  finished: '',
  cancelled: 'soft cancel',
  error: 'exit 1 mid-run',
  'failed-start': 'failed to start',
};

/**
 * Recently ended — the terminal-run history. Every row is clickable → the run
 * drawer (its diagnosis, if any, + the captured startup console log — CREW-291).
 * `finished` also carries a PR link as a secondary action. Always visible:
 * empty → a muted "Nothing ended recently".
 */
export function RecentlyEnded({ runs }: RecentlyEndedProps) {
  return (
    <Section title="Recently ended" count={runs.length > 0 ? `last ${runs.length}` : undefined}>
      {runs.length === 0 ? (
        <EmptyRow>Nothing ended recently</EmptyRow>
      ) : (
        runs.map((r) => <EndedRow key={`${r.key}-${r.endedAt}`} run={r} />)
      )}
    </Section>
  );
}

function EndedRow({ run }: { run: EndedRunView }) {
  const [open, setOpen] = useState(false);
  const pill = PILL[run.kind];
  const suffix = SUFFIX[run.kind];

  return (
    <>
      <Row
        onActivate={() => setOpen(true)}
        ariaLabel={`Open run drawer for ${run.key}`}
        statusSlot={
          <Badge role="status" aria-label={pill.label} color={pill.color} intensity="mid">
            {pill.label}
          </Badge>
        }
        title={<span className="text-sm font-semibold text-foreground">{run.key}</span>}
        subheader={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CommandBadge command={run.command} />
            <span className="truncate">{run.project}</span>
            <span aria-hidden>·</span>
            <span>ended {formatAgo(run.endedAt)}</span>
            {suffix !== '' && (
              <>
                <span aria-hidden>·</span>
                <span>{suffix}</span>
              </>
            )}
          </div>
        }
        actions={
          run.kind === 'finished' && run.prNumber !== undefined ? (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <Button
                color="pr_open"
                intensity="mid"
                size="sm"
                icon={<GitPullRequest aria-hidden />}
                asChild
              >
                <a href={run.prUrl ?? '#'} target="_blank" rel="noreferrer">
                  PR #{run.prNumber}
                </a>
              </Button>
            </div>
          ) : (
            <span aria-hidden />
          )
        }
      />
      <RunDrawer source={{ kind: 'ended', view: run }} open={open} onOpenChange={setOpen} />
    </>
  );
}
