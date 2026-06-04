import { figma } from '@figma/code-connect';

import { Stepper } from '@/components/Stepper';

figma.connect(Stepper, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=378-462', {
  props: {
    current: figma.enum('active', { '1': 1, '2': 2, '3': 3 }),
  },
  example: ({ current }) => <Stepper steps={['Project', 'Ticket', 'Confirm']} current={current} />,
});
