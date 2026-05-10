import { figma } from '@figma/code-connect';

import { Input } from '@/components/ui/input';

figma.connect(
  Input,
  'https://www.figma.com/design/UkPJj6vd7HMKcey7M0XF4N/Core-Design-System?node-id=520-3062',
  {
    example: () => <Input type="email" placeholder="Email" />,
  },
);
