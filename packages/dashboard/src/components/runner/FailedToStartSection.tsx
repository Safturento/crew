import { Section } from './Section.js';
import { FailedStartCard } from './FailedStartCard.js';
import type { FailedStartView } from './types.js';

interface FailedToStartSectionProps {
  failures: FailedStartView[];
  onArchive: (key: string) => void;
}

/**
 * The Failed-to-start attention queue — pinned high because debugging startup
 * failures is the #1 reason to open the page. Hidden entirely when empty (an
 * attention view, not a permanent section).
 */
export function FailedToStartSection({ failures, onArchive }: FailedToStartSectionProps) {
  if (failures.length === 0) return null;

  return (
    <Section
      title="Failed to start"
      count={failures.length}
      hint="Auto-clears when the ticket is re-run · or Archive to move it down to Recently ended"
    >
      {failures.map((f) => (
        <FailedStartCard key={f.key} failure={f} onArchive={onArchive} />
      ))}
    </Section>
  );
}
