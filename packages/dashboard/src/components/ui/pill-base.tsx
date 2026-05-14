import * as React from 'react';

import { cn } from '@/lib/utils';
import { pillSurfaceClasses, type PillColor, type PillIntensity } from '@/lib/pill-variants';

export type PillBaseProps = Omit<React.HTMLAttributes<HTMLElement>, 'color'> & {
  color?: PillColor;
  intensity?: PillIntensity;
  icon?: React.ReactNode;
  shape: string;
  as?: 'button' | 'span';
};

export function PillBase({
  color = 'running',
  intensity = 'mid',
  icon,
  shape,
  as = 'span',
  className,
  children,
  ...rest
}: PillBaseProps) {
  const Comp = as as 'button' | 'span';
  return (
    <Comp
      data-slot="pill"
      data-color={color}
      data-intensity={intensity}
      className={cn(
        'inline-flex w-fit items-center whitespace-nowrap',
        shape,
        pillSurfaceClasses(color, intensity),
        className,
      )}
      {...(rest as React.HTMLAttributes<HTMLElement>)}
    >
      {icon}
      {children}
    </Comp>
  );
}
