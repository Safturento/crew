import { figma } from '@figma/code-connect';

import { AgentsList } from '@/components/AgentsList';

figma.connect(
  AgentsList,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=220-227',
  {
    example: () => <AgentsList projects={[]} agents={[]} onSelectAgent={() => {}} />,
  },
);
