import { figma } from '@figma/code-connect';

import { ProjectRow } from '@/components/ProjectRow';

figma.connect(
  ProjectRow,
  'https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System?node-id=79-14',
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
