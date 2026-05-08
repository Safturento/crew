import type { TranscriptEvent } from 'crew-shared';

import { CardShell } from './CardShell.js';
import { formatLineTwo } from './utils.js';

interface RawCardProps {
  event: TranscriptEvent;
  /**
   * When supplied, the card represents an unrecognised content block within
   * `event.message.content[]` rather than the whole event. The expansion
   * shows just the offending block's JSON so a single bad block doesn't
   * dump the entire envelope.
   */
  block?: unknown;
  /** Optional override for the line-1 label (e.g. the unknown block's `type`). */
  label?: string;
}

export function RawCard({ event, block, label }: RawCardProps) {
  const resolvedLabel =
    label ??
    (block !== undefined
      ? labelForBlock(block)
      : event.type === 'unknown'
        ? 'unknown'
        : event.type);
  const expandedTarget = block !== undefined ? block : event.type === 'unknown' ? event.raw : event;
  return (
    <CardShell
      lineOne={`[${resolvedLabel}]`}
      lineTwo={formatLineTwo(event.timestamp)}
      expanded={JSON.stringify(expandedTarget, null, 2)}
    />
  );
}

function labelForBlock(block: unknown): string {
  if (block && typeof block === 'object' && 'type' in block) {
    const t = (block as { type: unknown }).type;
    if (typeof t === 'string') return t;
  }
  return 'unknown';
}
