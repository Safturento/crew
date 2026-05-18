import { figma } from '@figma/code-connect';

import { ProjectHeader } from '@/components/ProjectHeader';

figma.connect(
  ProjectHeader,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=220-315',
  {
    example: () => (
      <ProjectHeader name="kanban-api" configPath="~/.config/crew/projects/kanban-api.toml" />
    ),
  },
);
