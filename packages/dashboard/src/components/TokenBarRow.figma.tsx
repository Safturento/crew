import { figma } from '@figma/code-connect';

import { TokenBarRow } from '@/components/TokenBarRow';

figma.connect(
  TokenBarRow,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=555-449',
  {
    // The Figma component carries `tool`, `tokens`, and `percent` as TEXT properties
    // for showcase purposes — the dashboard component takes typed props
    // (tool: string, tokens: number, percent: number) and formats tokens via the
    // shared `formatTokens` helper. The snippet documents the canonical render.
    example: () => <TokenBarRow tool="Bash" tokens={18_400} percent={38.4} />,
  },
);
