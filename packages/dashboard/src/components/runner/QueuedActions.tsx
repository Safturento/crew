import { Row } from '../Row.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { formatAgo } from '@/format/relativeTime';
import { CommandBadge } from './CommandBadge.js';
import { Section } from './Section.js';
import type { QueuedActionView } from './types.js';

interface QueuedActionsProps {
  actions: QueuedActionView[];
  onDequeue: (key: string) => void;
}

/**
 * Queued actions — pending action requests the runner hasn't spawned yet.
 * `Dequeue` drops one before it launches. Hidden when empty.
 */
export function QueuedActions({ actions, onDequeue }: QueuedActionsProps) {
  if (actions.length === 0) return null;

  return (
    <Section title="Queued actions" count={`${actions.length} pending`}>
      {actions.map((a) => (
        <Row
          key={a.key}
          statusSlot={
            <Badge role="status" aria-label="queued" color="idle" intensity="mid">
              queued
            </Badge>
          }
          title={<span className="text-sm font-semibold text-foreground">{a.key}</span>}
          subheader={
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CommandBadge command={a.command} />
              <span className="truncate">{a.project}</span>
              <span aria-hidden>·</span>
              <span>queued {formatAgo(a.queuedAt)}</span>
            </div>
          }
          actions={
            <Button color="idle" intensity="ghost" size="sm" onClick={() => onDequeue(a.key)}>
              Dequeue
            </Button>
          }
        />
      ))}
    </Section>
  );
}
