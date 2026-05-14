import * as React from 'react';

import { PillBase } from './pill-base';
import type { PillColor, PillIntensity } from '@/lib/pill-variants';

const TAG_SHAPE =
  "h-[17px] gap-1 rounded-[4px] px-1.5 font-mono text-[11px] leading-none [&_svg:not([class*='size-'])]:size-2.5";

type TagProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> & {
  color?: PillColor;
  intensity?: PillIntensity;
  icon?: React.ReactNode;
  asChild?: boolean;
};

function Tag({
  color = 'running',
  intensity = 'mid',
  icon,
  asChild = false,
  children,
  ...rest
}: TagProps) {
  return (
    <PillBase
      {...rest}
      as="span"
      asChild={asChild}
      color={color}
      intensity={intensity}
      icon={icon}
      shape={TAG_SHAPE}
    >
      {children}
    </PillBase>
  );
}

export { Tag };
