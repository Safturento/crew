import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';

import './index.css';
import { App } from './App';
import { eventStream } from './data/eventStream.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element in index.html');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      throwOnError: true,
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    },
  },
});

// `cache.miss` means the daemon's SSE replay buffer evicted our last
// seen id — refetch everything so the dashboard catches up. Wired
// here (not at the singleton's construction site) to avoid a circular
// import between `eventStream.ts` and the QueryClient.
eventStream.on('cache.miss', () => {
  void queryClient.refetchQueries();
});

// Dev-only: expose `window.__crewTestInjectEvent` so Playwright specs
// can drive synthetic SSE events through the same dispatcher real
// messages use. Vite strips this branch in prod builds.
if (import.meta.env.DEV) {
  eventStream.exposeTestInjector();
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
