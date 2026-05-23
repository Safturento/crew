import { figma } from '@figma/code-connect';

import { TranscriptRow } from '@/components/Timeline/TranscriptRow';

figma.connect(
  TranscriptRow,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=553-445',
  {
    // The Figma `TranscriptRow` is a flat anatomy with TEXT and INSTANCE_SWAP
    // props for tag / text / timestamp / tokens. The code component derives
    // every one of those from the `event` it receives, so the example threads
    // a representative Bash tool_use through. See TranscriptRow.test.tsx for
    // the full Slim 5 category coverage.
    example: () => (
      <TranscriptRow
        event={
          {
            type: 'assistant',
            timestamp: '2026-05-22T14:30:04.000Z',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'tu-1',
                  name: 'Bash',
                  input: { command: 'docker compose -f docker-compose.dev.yml up -d' },
                },
              ],
              usage: { output_tokens: 180 },
            },
          } as never
        }
      />
    ),
  },
);
