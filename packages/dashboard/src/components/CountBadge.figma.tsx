import { figma } from '@figma/code-connect';

import { CountBadge } from '@/components/CountBadge';

figma.connect(
  CountBadge,
  'https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System?node-id=77-28',
  {
    props: {
      // The Figma component set's `state` variant uses kebab `pr-open`; the dashboard's
      // AgentState uses snake `pr_open`. Mapping bridges the two.
      state: figma.enum('state', {
        initializing: 'initializing',
        running: 'running',
        idle: 'idle',
        waiting: 'waiting',
        'pr-open': 'pr_open',
        error: 'error',
        finished: 'finished',
      }),
    },
    example: ({ state }) => <CountBadge count={6} state={state} />,
  },
);
