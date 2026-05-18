import { figma } from '@figma/code-connect';

import { StateHistoryBar } from '@/components/StateHistoryBar';

figma.connect(
  StateHistoryBar,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=220-257',
  {
    // The Figma component is a single skeleton showing a representative sequence of
    // state chips (state-token fills + mono labels with arrow separators). The
    // dashboard component computes the actual chip set at render time from the
    // `transitions` prop. The snippet documents the canonical render with sample data.
    example: () => (
      <StateHistoryBar
        transitions={[
          { ts: 0, from: null, to: 'init' },
          { ts: 1, from: 'init', to: 'running' },
          { ts: 2, from: 'running', to: 'waiting' },
          { ts: 3, from: 'waiting', to: 'pr_open' },
          { ts: 4, from: 'pr_open', to: 'finished' },
        ]}
        onScrollTo={() => {}}
      />
    ),
  },
);
