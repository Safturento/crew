import { figma } from '@figma/code-connect';

import { ProjectConfigBlock } from '@/components/ProjectConfigBlock';
import type { ProjectConfig } from '@/data/types';

const sampleConfig: ProjectConfig = {
  name: 'kanban-api',
  repo_path: '~/code/kanban-api',
  default_branch: 'main',
  jira: { project_key: 'KAN' },
} as ProjectConfig;

figma.connect(
  ProjectConfigBlock,
  'https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System?node-id=83-15',
  {
    example: () => <ProjectConfigBlock config={sampleConfig} />,
  },
);
