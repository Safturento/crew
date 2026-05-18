import { figma } from '@figma/code-connect';

import { TokenTable } from '@/components/TokenTable';

figma.connect(
  TokenTable,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=220-287',
  {
    // The Figma component is a single-variant skeleton with a representative header
    // (Tool / Tokens / Share) and three sample rows. Sort state, empty state, and
    // share-percentage rendering are runtime concerns documented by this snippet.
    example: () => (
      <TokenTable
        rows={[
          { tool: 'Read', tokens: 32_140 },
          { tool: 'Edit', tokens: 12_440 },
          { tool: 'Bash', tokens: 3_660 },
        ]}
      />
    ),
  },
);
