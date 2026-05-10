import { figma } from '@figma/code-connect';

import { Button } from '@/components/ui/button';

figma.connect(
  Button,
  'https://www.figma.com/design/UkPJj6vd7HMKcey7M0XF4N/Core-Design-System?node-id=73-3681',
  {
    props: {
      variant: figma.enum('Type', {
        primary: 'default',
        secondary: 'secondary',
        destructive: 'destructive',
        outline: 'outline',
        hhost: 'ghost',
        link: 'link',
        icon: 'default',
        'with icon': 'default',
        loading: 'default',
        'Size-small': 'default',
        'Size-default': 'default',
        'Size-large': 'default',
        Rounded: 'default',
      }),
      size: figma.enum('Type', {
        primary: 'default',
        secondary: 'default',
        destructive: 'default',
        outline: 'default',
        hhost: 'default',
        link: 'default',
        icon: 'icon',
        'with icon': 'default',
        loading: 'default',
        'Size-small': 'sm',
        'Size-default': 'default',
        'Size-large': 'lg',
        Rounded: 'default',
      }),
    },
    example: ({ variant, size }) => (
      <Button variant={variant} size={size}>
        Button
      </Button>
    ),
  },
);
