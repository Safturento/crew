import { figma } from '@figma/code-connect';

import { FailedStartCard } from '@/components/runner/FailedStartCard';

figma.connect(
  FailedStartCard,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=771-1142',
  {
    props: {
      headline: figma.string('Headline'),
      remediation: figma.string('Remediation'),
      showRemediation: figma.boolean('Show Remediation'),
      agentKey: figma.string('AgentKey'),
    },
    example: ({ headline, remediation, showRemediation, agentKey }) => (
      <FailedStartCard
        failure={{
          key: agentKey,
          command: 'run',
          project: '~/code/crew',
          failedAt: new Date().toISOString(),
          failure: {
            check: 'remote-repo-resolves',
            headline,
            remediation: showRemediation ? remediation : '',
            output: 'process exited 1 before registering',
          },
        }}
        onArchive={() => {}}
      />
    ),
  },
);
