import * as React from 'react';

import { Input, type InputProps } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type FormFieldProps = InputProps & {
  /** Field label, rendered uppercase above the input. */
  label: string;
  /** Extra classes for the wrapping vertical stack. */
  className?: string;
  /** Extra classes for the label element. */
  labelClassName?: string;
};

function FormField({ label, className, labelClassName, id, ...inputProps }: FormFieldProps) {
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label
        htmlFor={fieldId}
        className={cn('text-[11px] font-normal text-muted-foreground uppercase', labelClassName)}
      >
        {label}
      </Label>
      <Input id={fieldId} {...inputProps} />
    </div>
  );
}

export { FormField };
export type { FormFieldProps };
