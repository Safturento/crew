import { figma } from '@figma/code-connect';

import { ProjectRow } from '@/components/ProjectRow';

figma.connect(
  ProjectRow,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=220-300',
  {
    example: () => (
      <ProjectRow
        project={{
          name: 'kanban-api',
          repoPath: '~/code/kanban-api',
          branch: 'main',
          jiraKey: 'KAN',
          activeCount: 6,
        }}
      />
    ),
  },
);
