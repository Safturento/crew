import * as React from 'react';

import { PillBase } from './pill-base';
import type { PillColor, PillIntensity } from '@/lib/pill-variants';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const BUTTON_SHAPES: Record<ButtonSize, string> = {
  xs: "h-6 gap-1 rounded-md px-2 text-xs font-medium has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
  sm: "h-8 gap-1.5 rounded-md px-3 text-sm font-medium has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-4",
  md: "h-9 gap-2 rounded-md px-4 text-sm font-medium has-[>svg]:px-3 [&_svg:not([class*='size-'])]:size-4",
  lg: "h-10 gap-2 rounded-md px-6 text-sm font-medium has-[>svg]:px-4 [&_svg:not([class*='size-'])]:size-4",
};

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & {
  color?: PillColor;
  intensity?: PillIntensity;
  size?: ButtonSize;
  icon?: React.ReactNode;
  asChild?: boolean;
};

function Button({
  color = 'white',
  intensity = 'loud',
  size = 'md',
  icon,
  asChild = false,
  children,
  ...rest
}: ButtonProps) {
  return (
    <PillBase
      {...(rest as React.HTMLAttributes<HTMLElement>)}
      as="button"
      asChild={asChild}
      color={color}
      intensity={intensity}
      icon={icon}
      shape={BUTTON_SHAPES[size]}
    >
      {children}
    </PillBase>
  );
}

export { Button };
