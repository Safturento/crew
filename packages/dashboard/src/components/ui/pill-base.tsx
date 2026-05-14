import * as React from 'react';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';
import { pillSurfaceClasses, type PillColor, type PillIntensity } from '@/lib/pill-variants';

export type PillBaseProps = Omit<React.HTMLAttributes<HTMLElement>, 'color'> & {
  color?: PillColor;
  intensity?: PillIntensity;
  icon?: React.ReactNode;
  shape: string;
  as?: 'button' | 'span';
  asChild?: boolean;
};

export function PillBase({
  color = 'running',
  intensity = 'mid',
  icon,
  shape,
  as = 'span',
  asChild = false,
  className,
  children,
  ...rest
}: PillBaseProps) {
  const mergedClassName = cn(
    'inline-flex w-fit items-center whitespace-nowrap',
    shape,
    pillSurfaceClasses(color, intensity),
    className,
  );

  if (asChild) {
    return (
      <Slot.Root
        data-slot="pill"
        data-color={color}
        data-intensity={intensity}
        className={mergedClassName}
        {...(rest as React.HTMLAttributes<HTMLElement>)}
      >
        {icon}
        <Slot.Slottable>{children}</Slot.Slottable>
      </Slot.Root>
    );
  }

  const Comp = as as 'button' | 'span';
  return (
    <Comp
      data-slot="pill"
      data-color={color}
      data-intensity={intensity}
      className={mergedClassName}
      {...(rest as React.HTMLAttributes<HTMLElement>)}
    >
      {icon}
      {children}
    </Comp>
  );
}
