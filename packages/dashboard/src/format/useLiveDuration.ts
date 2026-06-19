import { useEffect, useState } from 'react';

import { formatDuration } from './duration.js';

/**
 * A live-ticking elapsed-duration string from an ISO start. Re-renders once a
 * second while `active`, so a running row's clock advances without a refetch.
 * Shared by AgentRow and the Runner page's ProcessRow.
 */
export function useLiveDuration(startIso: string, active = true): string {
  const start = new Date(startIso).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [active]);
  return formatDuration(now - start);
}
