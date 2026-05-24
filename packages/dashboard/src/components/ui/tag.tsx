import * as React from 'react';

import { PillBase } from './pill-base';
import type { PillColor, PillIntensity } from '@/lib/pill-variants';
import type { ToolColorKey } from '@/data/tool-colors';

const TAG_SHAPE =
  "h-[17px] gap-1 rounded-[4px] px-1.5 font-mono text-[11px] leading-none [&_svg:not([class*='size-'])]:size-2.5";

type TagProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> & {
  color?: PillColor;
  toolColor?: ToolColorKey;
  intensity?: PillIntensity;
  icon?: React.ReactNode;
  asChild?: boolean;
};

function Tag({
  color = 'running',
  toolColor,
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
      toolColor={toolColor}
      intensity={intensity}
      icon={icon}
      shape={TAG_SHAPE}
    >
      {children}
    </PillBase>
  );
}

export { Tag };
