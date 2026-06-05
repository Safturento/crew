import { cva } from 'class-variance-authority';
import { Check, Minus, X } from 'lucide-react';
import type { ComponentType } from 'react';

import type { FinishStep, FinishStepStatus } from '@/data/types';

interface FinishStepsProps {
  steps: FinishStep[];
}

const STATUS_ICON: Record<FinishStepStatus, ComponentType<{ className?: string }>> = {
  ok: Check,
  skip: Minus,
  error: X,
};

const STATUS_LABEL: Record<FinishStepStatus, string> = {
  ok: 'ok',
  skip: 'skipped',
  error: 'error',
};

// Icon color per outcome — emerald for done, muted for no-op skip, red for
// failure. Mirrors the status palette used elsewhere in the dashboard.
const stepIcon = cva('size-3.5 shrink-0', {
  variants: {
    status: {
      ok: 'text-emerald-500',
      skip: 'text-muted-foreground',
      error: 'text-red-400',
    },
  },
});

/**
 * CREW-220: the live `crew finish` checklist rendered in the agent drawer.
 * One row per reported step (ok/skip/error), in emission order; skip/error
 * steps surface their detail. Renders nothing until the first step lands so
 * the drawer stays clean for agents that haven't run finish.
 */
export function FinishSteps({ steps }: FinishStepsProps) {
  if (steps.length === 0) return null;

  return (
    <section
      role="region"
      aria-label="Finish steps"
      className="overflow-hidden rounded-[10px] border border-border bg-card"
    >
      <div className="border-b border-border px-3.5 py-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">
        Finish
      </div>
      <ul>
        {steps.map((step) => {
          const Icon = STATUS_ICON[step.status];
          return (
            <li
              // `index` resets to 0 each `crew finish` run while the daemon
              // accumulates rows across runs, so it repeats — compose it with
              // `ts` (per-run wall-clock) for a stable, collision-free key.
              key={`${step.ts}-${step.index}`}
              data-status={step.status}
              className="flex items-start gap-2.5 border-t border-border px-3.5 py-2 first:border-t-0 text-sm"
            >
              <Icon
                aria-label={STATUS_LABEL[step.status]}
                className={`${stepIcon({ status: step.status })} mt-0.5`}
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="break-words font-mono text-foreground">{step.label}</span>
                {step.detail && (
                  <span className="break-words text-xs text-muted-foreground">{step.detail}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
