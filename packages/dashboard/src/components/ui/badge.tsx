import * as React from 'react';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';
import {
  pillSurfaceClasses,
  type PillColor,
  type PillIntensity,
} from '@/lib/pill-variants';
import { STATE_CLASSES } from '@/data/state-meta';
import type { AgentState } from '@/data/types';

type BadgeProps = React.ComponentProps<'span'> & {
  color?: PillColor;
  intensity?: PillIntensity;
  hasIcon?: boolean;
  asChild?: boolean;
};

function dotClass(color: PillColor): string {
  if (color === 'white') return 'bg-slate-500';
  return STATE_CLASSES[color as AgentState].solidBg;
}

function Badge({
  className,
  color = 'running',
  intensity = 'mid',
  hasIcon = false,
  asChild = false,
  children,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : 'span';
  return (
    <Comp
      data-slot="badge"
      data-color={color}
      data-intensity={intensity}
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-xs leading-none whitespace-nowrap',
        pillSurfaceClasses(color, intensity),
        className,
      )}
      {...props}
    >
      {hasIcon && (
        <span
          data-testid="badge-dot"
          aria-hidden
          className={cn('inline-block h-1.5 w-1.5 rounded-full', dotClass(color))}
        />
      )}
      {children}
    </Comp>
  );
}

export { Badge };
