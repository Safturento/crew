export type Route =
  | { kind: 'agents-list' }
  | { kind: 'agent-drawer'; key: string }
  | { kind: 'agent-full'; key: string }
  | { kind: 'projects' };

export function parseRoute(hash: string): Route {
  const stripped = hash.replace(/^#/, '');
  if (stripped === '' || stripped === '/') return { kind: 'agents-list' };

  const fullMatch = /^\/agent\/([^/]+)\/full$/.exec(stripped);
  if (fullMatch) return { kind: 'agent-full', key: fullMatch[1] };

  const drawerMatch = /^\/agent\/([^/]+)$/.exec(stripped);
  if (drawerMatch) return { kind: 'agent-drawer', key: drawerMatch[1] };

  if (stripped === '/projects') return { kind: 'projects' };

  return { kind: 'agents-list' };
}
