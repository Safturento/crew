export type Route =
  | { kind: 'agents-list' }
  | { kind: 'agent-detail'; key: string }
  | { kind: 'projects' };

export function parseRoute(hash: string): Route {
  const stripped = hash.replace(/^#/, '');
  if (stripped === '' || stripped === '/') return { kind: 'agents-list' };

  const agentMatch = /^\/agents\/([^/]+)$/.exec(stripped);
  if (agentMatch) return { kind: 'agent-detail', key: agentMatch[1] };

  if (stripped === '/projects') return { kind: 'projects' };

  return { kind: 'agents-list' };
}
