import { figma } from '@figma/code-connect';

import { AgentBody } from '@/components/AgentBody';

figma.connect(
  AgentBody,
  'https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System?node-id=24-2',
  {
    // AgentBody renders the agent drawer / full-page body. The Figma component is a
    // single-variant skeleton — `mode` is a runtime prop that swaps the "Open as page"
    // affordance, not a Figma variant axis. Snippet documents the canonical render.
    example: () => <AgentBody agentKey="kanban-api/KAN-23" mode="drawer" />,
  },
);
