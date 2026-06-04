import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-[14px] w-[26px] shrink-0 items-center rounded-full p-px outline-none transition-colors',
        'data-[state=checked]:bg-blue-1050 data-[state=unchecked]:bg-secondary',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-3 rounded-full transition-transform',
          'data-[state=checked]:translate-x-3 data-[state=unchecked]:translate-x-0',
          'data-[state=checked]:bg-blue-400 data-[state=unchecked]:bg-muted-foreground',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
