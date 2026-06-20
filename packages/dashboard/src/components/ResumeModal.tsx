import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/Modal';
import { cn } from '@/lib/utils';

type ResumeModalProps = {
  /** Agent / ticket key the resume targets. */
  agentKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called when the operator resumes. The steer message is **optional**: empty
   * (or whitespace-only) yields `undefined` → a plain resume; a typed message
   * yields the trimmed string → a `message` command (resume-with-injected
   * -message). The caller owns the enqueue (CREW-274 control layer) — this modal
   * stays presentational.
   */
  onSubmit: (message: string | undefined) => void;
};

/**
 * CREW-274: the Resume modal for a paused agent. Unlike `FixPrModal`, the
 * message is optional — Resume is always enabled, so the common "just continue"
 * case is one click away while a steer message is there when the operator wants
 * to redirect the resumed turn.
 */
function ResumeModal({ agentKey, open, onOpenChange, onSubmit }: ResumeModalProps) {
  const [message, setMessage] = React.useState('');
  const fieldId = React.useId();

  // Reset the draft whenever the modal closes so the next open starts empty.
  React.useEffect(() => {
    if (!open) setMessage('');
  }, [open]);

  const submit = () => {
    const trimmed = message.trim();
    onSubmit(trimmed.length > 0 ? trimmed : undefined);
    onOpenChange(false);
  };

  return (
    <Modal title={`Resume — ${agentKey}`} open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-[5px]">
          <Label
            htmlFor={fieldId}
            className="text-[11px] font-normal text-muted-foreground uppercase"
          >
            Steer message (optional)
          </Label>
          <textarea
            id={fieldId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Optionally redirect the resumed turn — leave empty to just continue."
            className={cn(
              'w-full min-w-0 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] dark:bg-input/30',
              'placeholder:text-muted-foreground',
              'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            )}
          />
        </div>
        <div className="flex flex-row justify-end gap-2">
          <Button color="running" intensity="mid" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button color="running" intensity="loud" size="sm" onClick={submit}>
            Resume
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export { ResumeModal };
export type { ResumeModalProps };
