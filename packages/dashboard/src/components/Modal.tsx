import * as React from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ModalProps = {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showClose?: boolean;
  /**
   * Modal box width in px. Defaults to 560 (the shared size for most dashboard
   * modals). The New Run picker overrides to 620 so its two-row ticket rows have
   * room for a wrapping title beside the priority badge (Figma 362:2212).
   */
  width?: number;
  children: React.ReactNode;
};

function Modal({
  title,
  open,
  onOpenChange,
  showClose = true,
  width = 560,
  children,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 rounded-[14px] border-border bg-slate-950 p-0 shadow-[0_30px_80px_-10px_rgba(0,0,0,0.7)]"
        style={{ width, maxWidth: width }}
        showCloseButton={false}
      >
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border px-3.5 py-3">
          <DialogTitle className="text-sm font-medium text-foreground">{title}</DialogTitle>
          {showClose && (
            <Button
              color="running"
              intensity="ghost"
              size="sm"
              icon={<X aria-hidden />}
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            />
          )}
        </DialogHeader>
        <div className="px-3.5 py-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export { Modal };
