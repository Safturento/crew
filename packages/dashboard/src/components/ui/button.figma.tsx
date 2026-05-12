import { figma } from '@figma/code-connect';

import { Button } from '@/components/ui/button';

figma.connect(Button, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=272-120', {
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
    size: figma.enum('type', {
      'button-xs': 'xs',
      'button-sm': 'sm',
      'button-default': 'default',
      'button-lg': 'lg',
      'button-icon-xs': 'icon-xs',
      'button-icon-sm': 'icon-sm',
      'button-icon-default': 'icon-default',
      'button-icon-lg': 'icon-lg',
    }),
  },
  example: ({ label, color, intensity, size }) => (
    <Button color={color} intensity={intensity} size={size}>
      {label}
    </Button>
  ),
});
