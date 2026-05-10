import { figma } from '@figma/code-connect';

import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

figma.connect(
  FormItem,
  'https://www.figma.com/design/UkPJj6vd7HMKcey7M0XF4N/Core-Design-System?node-id=1188-5362',
  {
    example: () => (
      <FormItem>
        <FormLabel>Email</FormLabel>
        <FormControl>
          <Input type="email" placeholder="you@example.com" />
        </FormControl>
        <FormDescription>We&apos;ll never share your email.</FormDescription>
        <FormMessage />
      </FormItem>
    ),
  },
);
