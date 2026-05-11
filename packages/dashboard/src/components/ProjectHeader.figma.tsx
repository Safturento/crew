import { figma } from '@figma/code-connect';

import { ProjectHeader } from '@/components/ProjectHeader';

figma.connect(
  ProjectHeader,
  'https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System?node-id=82-15',
  {
    example: () => (
      <ProjectHeader name="kanban-api" configPath="~/.config/crew/projects/kanban-api.toml" />
    ),
  },
);
