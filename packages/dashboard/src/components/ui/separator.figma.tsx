import { figma } from '@figma/code-connect';

import { Separator } from '@/components/ui/separator';

figma.connect(
  Separator,
  'https://www.figma.com/design/UkPJj6vd7HMKcey7M0XF4N/Core-Design-System?node-id=76-10202',
  {
    example: () => <Separator />,
  },
);
