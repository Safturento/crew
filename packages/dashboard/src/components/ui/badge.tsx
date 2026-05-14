import * as React from 'react';

import { PillBase } from './pill-base';
import type { PillColor, PillIntensity } from '@/lib/pill-variants';

const BADGE_SHAPE =
  "h-5 gap-1.5 rounded-full px-2 py-0.5 font-mono text-xs leading-none [&_svg:not([class*='size-'])]:size-3";

type BadgeProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> & {
  color?: PillColor;
  intensity?: PillIntensity;
  icon?: React.ReactNode;
  asChild?: boolean;
};

function Badge({
  color = 'running',
  intensity = 'mid',
  icon,
  asChild = false,
  children,
  ...rest
}: BadgeProps) {
  return (
    <PillBase
      {...rest}
      as="span"
      asChild={asChild}
      color={color}
      intensity={intensity}
      icon={icon}
      shape={BADGE_SHAPE}
    >
      {children}
    </PillBase>
  );
}

export { Badge };
