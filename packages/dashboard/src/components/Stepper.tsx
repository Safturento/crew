import * as React from 'react';

import { cn } from '@/lib/utils';

type StepperProps = {
  steps: string[];
  current: number;
  className?: string;
};

function Stepper({ steps, current, className }: StepperProps) {
  return (
    <div className={cn('flex items-center gap-2 font-mono text-xs', className)}>
      {steps.map((label, idx) => {
        const stepNum = idx + 1;
        const active = stepNum === current;
        return (
          <React.Fragment key={label}>
            <span
              data-active={active}
              className={cn(active ? 'font-medium text-foreground' : 'text-muted-foreground')}
            >
              {stepNum} · {label}
            </span>
            {idx < steps.length - 1 && (
              <span aria-hidden className="text-muted-foreground">
                ›
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export { Stepper };
