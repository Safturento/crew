import { useCallback, useMemo, useState } from 'react';

import type { Agent } from '../data/types.js';
import { attentionKeys } from './attention.js';

export interface AttentionApi {
  count: number;
  clear: () => void;
}

export function useAttention(agents: Agent[]): AttentionApi {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const live = useMemo(() => attentionKeys(agents), [agents]);

  const count = useMemo(() => {
    let n = 0;
    for (const key of live) {
      if (!dismissed.has(key)) n += 1;
    }
    return n;
  }, [live, dismissed]);

  const clear = useCallback(() => {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const key of live) next.add(key);
      return next;
    });
  }, [live]);

  return { count, clear };
}
