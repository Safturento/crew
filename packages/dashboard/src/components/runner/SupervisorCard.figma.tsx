import { figma } from '@figma/code-connect';

import { SupervisorCard } from '@/components/runner/SupervisorCard';

figma.connect(
  SupervisorCard,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=789-1190',
  {
    props: {
      // The `state` variant axis maps to runtime online/offline; the meta line
      // is data, not a Figma property. Snippet documents the canonical mount.
      state: figma.enum('state', { running: true, down: false }),
    },
    example: ({ state }) => (
      <SupervisorCard supervisor={{ online: state, lastSeen: Date.now() }} />
    ),
  },
);
