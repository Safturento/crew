import * as React from 'react';

import { cn } from '@/lib/utils';
import { pillSurfaceClasses, type PillColor, type PillIntensity } from '@/lib/pill-variants';

type TagProps = React.ComponentProps<'span'> & {
  color?: PillColor;
  intensity?: PillIntensity;
};

function Tag({ className, color = 'running', intensity = 'mid', children, ...props }: TagProps) {
  return (
    <span
      data-slot="tag"
      data-color={color}
      data-intensity={intensity}
      className={cn(
        'inline-flex h-[17px] w-fit items-center rounded-[4px] px-1.5 font-mono text-[11px] leading-none whitespace-nowrap',
        pillSurfaceClasses(color, intensity),
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { Tag };
