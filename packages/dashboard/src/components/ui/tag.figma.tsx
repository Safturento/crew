import { figma } from '@figma/code-connect';

import { Tag } from '@/components/ui/tag';

figma.connect(Tag, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=272-120', {
  variant: { type: 'tag' },
  props: {
    label: figma.string('Label'),
    color: figma.enum('color', {
      idle: 'idle',
      initializing: 'initializing',
      running: 'running',
      waiting: 'waiting',
      'pr-open': 'pr_open',
      error: 'error',
      finished: 'finished',
      white: 'white',
    }),
    intensity: figma.enum('intensity', {
      ghost: 'ghost',
      muted: 'muted',
      mid: 'mid',
      loud: 'loud',
    }),
  },
  example: ({ label, color, intensity }) => (
    <Tag color={color} intensity={intensity}>
      {label}
    </Tag>
  ),
});
