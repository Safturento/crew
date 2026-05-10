import { figma } from '@figma/code-connect';

import { TokenTable } from '@/components/TokenTable';

figma.connect(
  TokenTable,
  'https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq/Crew-Design-System?node-id=26-4',
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
