import { figma } from '@figma/code-connect';

import { CondensedHeader } from '@/components/CondensedHeader';
import type { AgentDetail } from '@/data/types';

// Sample fixture used purely as an in-snippet example for Figma Code Connect.
// Per `project_code_connect_skipped.md`, this file is not published — crew is on
// Figma Pro, so `.figma.tsx` files live as inert docs on disk read by the
// design-with-figma skill.
const SAMPLE_DETAIL: AgentDetail = {
  key: 'kanban-api/KAN-23',
  project: 'kanban-api',
  ticket_key: 'KAN-23',
  ticket_title: 'Drag-and-drop reordering keeps stale board state',
  state: 'waiting',
  worktree_path: '~/code/kanban-api/.worktrees/KAN-23',
  pr_url: null,
  app_url: 'http://localhost:7421',
  jira_url: 'https://safturento.atlassian.net/browse/KAN-23',
  tokens_by_tool: [],
  model: '',
  runs: [],
  tokens: { total: 48_000, input: 0, output: 0, cache_read: 0, cache_creation: 0 },
  tool_call_count: 0,
};

figma.connect(
  CondensedHeader,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=706-1059',
  {
    example: () => <CondensedHeader detail={SAMPLE_DETAIL} showCloseButton />,
  },
);
