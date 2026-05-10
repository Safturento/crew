import { figma } from '@figma/code-connect';

import { Label } from '@/components/ui/label';

figma.connect(
  Label,
  'https://www.figma.com/design/UkPJj6vd7HMKcey7M0XF4N/Core-Design-System?node-id=76-8617',
  {
    example: () => <Label htmlFor="email">Email</Label>,
  },
);
