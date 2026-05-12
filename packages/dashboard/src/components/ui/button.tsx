import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';
import {
  pillSurfaceClasses,
  type PillColor,
  type PillIntensity,
} from '@/lib/pill-variants';

const buttonBase =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const buttonSizes = cva('', {
  variants: {
    size: {
      xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
      sm: 'h-8 gap-1.5 px-3 text-sm has-[>svg]:px-2.5',
      default: 'h-9 px-4 py-2 text-sm has-[>svg]:px-3',
      lg: 'h-10 px-6 text-sm has-[>svg]:px-4',
      'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
      'icon-sm': 'size-8',
      'icon-default': 'size-9',
      'icon-lg': 'size-10',
    },
  },
  defaultVariants: { size: 'default' },
});

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonSizes> & {
    color?: PillColor;
    intensity?: PillIntensity;
    asChild?: boolean;
  };

function Button({
  className,
  color = 'white',
  intensity = 'loud',
  size = 'default',
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-color={color}
      data-intensity={intensity}
      data-size={size}
      className={cn(
        buttonBase,
        buttonSizes({ size }),
        pillSurfaceClasses(color, intensity),
        className,
      )}
      {...props}
    />
  );
}

export { Button, buttonSizes };
