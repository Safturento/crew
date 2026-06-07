import * as React from 'react';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';
import { pillSurfaceClasses, type PillColor, type PillIntensity } from '@/lib/pill-variants';
import type { ToolColorKey } from '@/data/tool-colors';

export type PillBaseProps = Omit<React.HTMLAttributes<HTMLElement>, 'color'> & {
  color?: PillColor;
  toolColor?: ToolColorKey;
  intensity?: PillIntensity;
  icon?: React.ReactNode;
  shape: string;
  as?: 'button' | 'span';
  asChild?: boolean;
};

export function PillBase({
  color = 'running',
  toolColor,
  intensity = 'mid',
  icon,
  shape,
  as = 'span',
  asChild = false,
  className,
  children,
  ...rest
}: PillBaseProps) {
  // "Interactable" = the pill renders an interactive element (a <button> or an
  // asChild trigger/link). Only those get hover styling — static <span> pills
  // don't. No separate prop: the markup already encodes interactivity.
  const interactive = as === 'button' || asChild;

  const mergedClassName = cn(
    'inline-flex w-fit items-center whitespace-nowrap',
    shape,
    pillSurfaceClasses(color, intensity, toolColor, interactive),
    interactive && 'cursor-pointer transition-[filter,background-color] duration-100',
    className,
  );

  const dataColor = toolColor ?? color;

  // `asChild` takes precedence over `as`: when set, the element comes from the
  // wrapped child and the `as` prop is ignored.
  if (asChild) {
    return (
      <Slot.Root
        data-slot="pill"
        data-color={dataColor}
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
      data-color={dataColor}
      data-intensity={intensity}
      className={mergedClassName}
      {...(rest as React.HTMLAttributes<HTMLElement>)}
    >
      {icon}
      {children}
    </Comp>
  );
}
