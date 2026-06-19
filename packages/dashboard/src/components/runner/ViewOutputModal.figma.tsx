import { figma } from '@figma/code-connect';

import { ViewOutputModal } from '@/components/runner/ViewOutputModal';

// Maps to the `ViewOutputContent` composite — the Diagnosis + Output body the
// modal renders. The dialog chrome (header/close) is the Modal composite.
figma.connect(
  ViewOutputModal,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=774-1150',
  {
    example: () => (
      <ViewOutputModal
        open
        onOpenChange={() => {}}
        agentKey="CREW-241"
        command="run"
        project="~/code/crew"
        failedAt={new Date().toISOString()}
        failure={{
          check: 'remote-repo-resolves',
          headline: "Remote 'origin' not found in project config",
          remediation: 'set repo.remote in crew.toml',
          output:
            '$ crew run CREW-241\npreflight: remote-repo-resolves\nprocess exited 1 before registering',
        }}
      />
    ),
  },
);
