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
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=220-318',
  {
    example: () => <ProjectConfigBlock config={sampleConfig} />,
  },
);
