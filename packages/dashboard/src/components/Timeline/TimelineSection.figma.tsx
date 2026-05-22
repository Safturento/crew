import { figma } from '@figma/code-connect';

import { TimelineSection } from '@/components/Timeline/TimelineSection';

figma.connect(
  TimelineSection,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=559-650',
  {
    props: {
      state: figma.enum('state', {
        initializing: 'initializing',
        running: 'running',
        waiting: 'waiting',
        'pr-open': 'pr_open',
        error: 'error',
        finished: 'finished',
        idle: 'idle',
      }),
    },
    // `meta` + `timestamp` in Figma are pre-baked TEXT properties; the
    // code component derives them from typed inputs (startedAt, elapsedMs,
    // eventCount, tokenSum). Example threads through fixture values so the
    // snippet renders standalone.
    example: ({ state }) => (
      <TimelineSection
        state={state}
        startedAt={Date.parse('2026-05-22T14:30:24Z')}
        elapsedMs={8 * 60 * 1000 + 12 * 1000}
        eventCount={14}
        tokenSum={24_000}
        isOpen={true}
        onToggle={() => {}}
      >
        <div />
      </TimelineSection>
    ),
  },
);
