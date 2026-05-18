import { figma } from '@figma/code-connect';

import { AgentRow } from '@/components/AgentRow';

figma.connect(
  AgentRow,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=212-910',
  {
    // AgentRow's runtime state (state, key, ticketTitle, runtime, tokens) is a data
    // contract rather than a variant axis — we don't map per-state visual variants
    // until the Figma skeleton grows them. Snippet documents the canonical render.
    example: () => (
      <AgentRow
        agent={{
          key: 'KAN-23',
          projectName: 'kanban-api',
          ticketTitle: 'Add board archival endpoint',
          state: 'running',
          startedAt: new Date().toISOString(),
          tokens: 48_240,
        }}
        onSelect={() => {}}
      />
    ),
  },
);
