import { figma } from '@figma/code-connect';

import { Button } from '@/components/ui/button';

figma.connect(Button, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=272-120', {
  props: {
    label: figma.string('Label'),
    icon: figma.instance('Icon'),
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
      'button-default': 'md',
      'button-lg': 'lg',
    }),
  },
  example: ({ label, color, intensity, size, icon }) => (
    <Button color={color} intensity={intensity} size={size} icon={icon}>
      {label}
    </Button>
  ),
});
