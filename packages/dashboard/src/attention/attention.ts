import { STATE_META } from '../data/state-meta.js';
import type { Agent } from '../data/types.js';

export function attentionKeys(agents: Agent[]): Set<string> {
  return new Set(agents.filter((a) => STATE_META[a.state].attention).map((a) => a.key));
}
