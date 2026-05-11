import { figma } from '@figma/code-connect';

import { ProjectSection } from '@/components/ProjectSection';

figma.connect(
  ProjectSection,
  'https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System?node-id=21-21',
  {
    example: () => (
      <ProjectSection
        project={{
          name: 'kanban-api',
          repoPath: '~/code/kanban-api',
          branch: 'main',
          jiraKey: 'KAN',
          activeCount: 2,
        }}
        agents={[]}
        onSelectAgent={() => {}}
      />
    ),
  },
);
