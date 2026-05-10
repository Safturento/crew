import { figma } from '@figma/code-connect';

import { Badge } from '@/components/ui/badge';

figma.connect(
  Badge,
  'https://www.figma.com/design/UkPJj6vd7HMKcey7M0XF4N/Core-Design-System?node-id=665-2024',
  {
    props: {
      variant: figma.enum('Type', {
        default: 'default',
        secondary: 'secondary',
        destructive: 'destructive',
        outline: 'outline',
        secondary_icon: 'secondary',
        default_number: 'default',
        secondary_number: 'secondary',
        destructive_number: 'destructive',
      }),
    },
    example: ({ variant }) => <Badge variant={variant}>Badge</Badge>,
  },
);
