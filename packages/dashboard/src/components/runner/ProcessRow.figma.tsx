import { figma } from '@figma/code-connect';

import { ProcessRow } from '@/components/runner/ProcessRow';

figma.connect(
  ProcessRow,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=767-1179',
  {
    props: {
      // The Figma `state` variant maps to the live-process state; key/project/
      // duration are data, not variant axes.
      state: figma.enum('state', {
        running: 'running',
        launching: 'launching',
        cancelling: 'cancelling',
      }),
    },
    example: ({ state }) => (
      <ProcessRow
        process={{
          agentKey: 'CREW-231',
          command: 'run',
          pid: 10,
          pgid: 10,
          actionRequestId: null,
          spawnedAt: new Date().toISOString(),
          state,
          project: '~/code/crew',
        }}
        onCancel={() => {}}
        onForceKill={() => {}}
      />
    ),
  },
);
