import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/Modal';
import { cn } from '@/lib/utils';

type FixPrModalProps = {
  /** Agent / ticket key the comment + fix-pr run target. */
  agentKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called with the trimmed comment when the user submits. The caller owns
   * the enqueue (App-level action layer) — this modal stays presentational.
   */
  onSubmit: (comment: string) => void;
};

/**
 * CREW-219: the Fix PR comment modal. Surfaced from a `pr_open` agent's
 * QuickAction, it collects a review comment; on submit the App layer enqueues
 * a `fix_pr` action carrying the comment (the runner posts it to the PR and
 * runs `crew fix-pr --from-pr`). Submit is blocked until the comment is
 * non-empty.
 */
function FixPrModal({ agentKey, open, onOpenChange, onSubmit }: FixPrModalProps) {
  const [comment, setComment] = React.useState('');
  const fieldId = React.useId();
  const trimmed = comment.trim();
  const canSubmit = trimmed.length > 0;

  // Reset the draft whenever the modal closes so the next open starts empty.
  React.useEffect(() => {
    if (!open) setComment('');
  }, [open]);

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    onOpenChange(false);
  };

  return (
    <Modal title={`Fix PR — ${agentKey}`} open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-[5px]">
          <Label
            htmlFor={fieldId}
            className="text-[11px] font-normal text-muted-foreground uppercase"
          >
            Comment
          </Label>
          <textarea
            id={fieldId}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            placeholder="What should the agent address on this PR?"
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
          <Button color="running" intensity="loud" size="sm" disabled={!canSubmit} onClick={submit}>
            Fix PR
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export { FixPrModal };
export type { FixPrModalProps };
