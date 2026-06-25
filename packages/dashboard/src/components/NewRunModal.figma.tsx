import { figma } from '@figma/code-connect';

import { NewRunModal } from '@/components/NewRunModal';
import { MockDaemonClient } from '@/data/MockDaemonClient';

// The New Run flow is three frames in the Crew screens file (Select Project /
// Select Ticket / Confirm). Code Connect maps to a single node — we point at
// the step-1 "Select Project" frame, since the modal owns the whole stepper.
// Code Connect publishing is intentionally skipped (see .agents/design-system.md);
// this file is inert documentation of the Figma → code mapping.
figma.connect(
  NewRunModal,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=1-2980',
  {
    props: {},
    example: () => (
      <NewRunModal
        open
        onOpenChange={() => {}}
        projects={[
          {
            name: 'kanban-api',
            repoPath: '~/code/kanban-api',
            branch: 'main',
            jiraKey: 'KAN',
            activeCount: 2,
          },
        ]}
        onConfirm={() => {}}
        client={new MockDaemonClient()}
      />
    ),
  },
);
