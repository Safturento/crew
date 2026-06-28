import { figma } from '@figma/code-connect';

import { RunDrawer, type RunDrawerSource } from '@/components/runner/RunDrawer';

// The Figma `RunDrawerBody` component set (881:1216) carries a single `state`
// variant axis (failed-start / running / ended). In code each maps to a
// `RunDrawerSource` discriminated member — a live process, a failed-start row,
// or a recently-ended row. Code Connect stays unpublished (Figma Pro), so this
// is inert documentation, but it is typechecked, so the source literals below
// must satisfy the real union.
const SOURCES: Record<string, RunDrawerSource> = {
  'failed-start': {
    kind: 'failed-start',
    view: {
      key: 'CREW-241',
      command: 'run',
      project: 'crew',
      failedAt: new Date().toISOString(),
      failure: {
        check: 'repo-config',
        headline: "Remote 'origin' not found in project config",
        remediation: 'set repo.remote in crew.toml',
        output: '$ crew run CREW-241\nexit code 1',
      },
    },
  },
  running: {
    kind: 'live',
    process: {
      agentKey: 'CREW-231',
      command: 'run',
      pid: 48213,
      pgid: 48213,
      actionRequestId: null,
      spawnedAt: new Date().toISOString(),
      state: 'running',
      project: 'crew',
    },
  },
  ended: {
    kind: 'ended',
    view: {
      key: 'CREW-227',
      command: 'run',
      project: 'crew',
      endedAt: new Date().toISOString(),
      kind: 'finished',
      prUrl: 'https://github.com/Safturento/crew/pull/340',
      prNumber: 340,
    },
  },
};

figma.connect(
  RunDrawer,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=881-1216',
  {
    props: {
      source: figma.enum('state', {
        'failed-start': SOURCES['failed-start'],
        running: SOURCES.running,
        ended: SOURCES.ended,
      }),
    },
    example: ({ source }) => <RunDrawer source={source} open onOpenChange={() => {}} />,
  },
);
