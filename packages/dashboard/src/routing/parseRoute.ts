export type Route =
  | { kind: 'agents-list' }
  | { kind: 'agent-drawer'; key: string }
  | { kind: 'agent-full'; key: string }
  | { kind: 'projects' }
  | { kind: 'project-detail'; slug: string };

export function parseRoute(hash: string): Route {
  const stripped = hash.replace(/^#/, '');
  if (stripped === '' || stripped === '/') return { kind: 'agents-list' };

  const fullMatch = /^\/agent\/([^/]+)\/full$/.exec(stripped);
  if (fullMatch) return { kind: 'agent-full', key: fullMatch[1] };

  const drawerMatch = /^\/agent\/([^/]+)$/.exec(stripped);
  if (drawerMatch) return { kind: 'agent-drawer', key: drawerMatch[1] };

  if (stripped === '/projects') return { kind: 'projects' };

  const projectDetailMatch = /^\/projects\/([^/]+)$/.exec(stripped);
  if (projectDetailMatch)
    return { kind: 'project-detail', slug: decodeURIComponent(projectDetailMatch[1]) };

  return { kind: 'agents-list' };
}
