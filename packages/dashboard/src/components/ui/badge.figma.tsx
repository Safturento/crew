import { figma } from '@figma/code-connect';

import { Badge } from '@/components/ui/badge';

figma.connect(Badge, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=272-120', {
  props: {
    label: figma.string('Label'),
    hasIcon: figma.boolean('Has Icon'),
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
  example: ({ label, color, intensity, hasIcon }) => (
    <Badge color={color} intensity={intensity} hasIcon={hasIcon}>
      {label}
    </Badge>
  ),
});
