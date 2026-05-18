import { figma } from '@figma/code-connect';

import { ProjectSection } from '@/components/ProjectSection';

figma.connect(
  ProjectSection,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=220-224',
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
