import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Accessible dialog title. Rendered `sr-only` — the visible header lives in
   * `children` (e.g. AgentBody's DrawerHeader), but Radix requires a Title node
   * for screen-reader labelling.
   */
  title: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Right-anchored, full-height drawer built on the Radix Dialog primitive —
 * the side-panel sibling to `Modal` (which is the centered variant). Modal
 * gives us, for free, Esc + overlay-click dismissal, focus trap + restore,
 * background scroll-lock, and nested-layer dismissal (a Popover opened inside
 * dismisses on its own without closing the drawer — no manual overlay guard).
 *
 * Enter/exit slide rides on `tw-animate-css`'s standard `slide-in-from-right`
 * / `slide-out-to-right` (panel) and `fade-in-0` / `fade-out-0` (overlay)
 * utilities; the durations + easing reproduce the prior bespoke keyframes
 * (300ms in / 200ms out on a decelerating curve). Radix keeps the content
 * mounted through the close animation.
 */
function Drawer({ open, onOpenChange, title, className, children }: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-testid="drawer-backdrop"
          className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:duration-200 data-[state=closed]:duration-150 data-[state=open]:ease-out data-[state=closed]:ease-in"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-5xl flex-col bg-background shadow-2xl outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
            'data-[state=open]:duration-300 data-[state=closed]:duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]',
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { Drawer };
