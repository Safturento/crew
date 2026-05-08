import type { TranscriptEvent } from 'crew-shared';

import { CardShell } from './CardShell.js';
import { formatLineTwo } from './utils.js';

interface RawCardProps {
  event: TranscriptEvent;
}

export function RawCard({ event }: RawCardProps) {
  const label = event.type === 'unknown' ? 'unknown' : event.type;
  return (
    <CardShell
      lineOne={`[${label}]`}
      lineTwo={formatLineTwo(event.timestamp)}
      expanded={JSON.stringify(event, null, 2)}
    />
  );
}
