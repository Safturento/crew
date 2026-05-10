import { figma } from '@figma/code-connect';

import { AgentsList } from '@/components/AgentsList';

figma.connect(
  AgentsList,
  'https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System?node-id=21-25',
  {
    example: () => (
      <AgentsList projects={[]} agents={[]} onSelectAgent={() => {}} />
    ),
  },
);
