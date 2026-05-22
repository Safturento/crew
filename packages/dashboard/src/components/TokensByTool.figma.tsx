import { figma } from '@figma/code-connect';

import { TokensByTool } from '@/components/TokensByTool';

figma.connect(
  TokensByTool,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=577-643',
  {
    // The Figma component carries `total` as a TEXT property and the body is a stack
    // of TokenBarRow instances; runtime takes `tokensByTool: AgentDetailTokensByTool[]`
    // (driven by the daemon's per-tool aggregate query) plus the agent's total token
    // count for the footer. The snippet documents the canonical render.
    example: () => (
      <TokensByTool
        tokensByTool={[
          { tool: 'Bash', tokens: 18_400, percent: 38.4 },
          { tool: 'Read', tokens: 12_100, percent: 25.2 },
          { tool: 'Edit', tokens: 9_600, percent: 20.1 },
          { tool: 'Grep', tokens: 4_200, percent: 8.8 },
          { tool: 'Glob', tokens: 1_800, percent: 3.8 },
          { tool: 'Question', tokens: 1_200, percent: 2.6 },
          { tool: 'Write', tokens: 510, percent: 1.1 },
        ]}
        total={48_000}
      />
    ),
  },
);
