import { useEffect, useState } from 'react';

import { parseRoute, type Route } from './parseRoute.js';

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const handler = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}
