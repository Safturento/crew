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
    example: () => {
      const bucket = (output: number) => ({ input: 0, output, cacheCreation: 0, cacheRead: 0 });
      return (
        <TokensByTool
          tokensByTool={[
            { tool: 'Bash', tokens: bucket(18_400), totalTokens: 18_400 },
            { tool: 'Read', tokens: bucket(12_100), totalTokens: 12_100 },
            { tool: 'Edit', tokens: bucket(9_600), totalTokens: 9_600 },
            { tool: 'Grep', tokens: bucket(4_200), totalTokens: 4_200 },
            { tool: 'Glob', tokens: bucket(1_800), totalTokens: 1_800 },
            { tool: 'Question', tokens: bucket(1_200), totalTokens: 1_200 },
            { tool: 'Write', tokens: bucket(510), totalTokens: 510 },
          ]}
          total={48_000}
        />
      );
    },
  },
);
