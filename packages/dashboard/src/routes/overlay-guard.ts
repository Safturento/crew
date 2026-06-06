import { createContext, useContext } from 'react';

/**
 * Lets a nested overlay (e.g. the Timeline Filters popover) tell the drawer
 * backdrop to ignore the click that dismissed the overlay, so dismissing the
 * overlay doesn't also close the drawer. The default is a no-op so components
 * that consume the guard (Filters) still work when rendered outside a drawer
 * (e.g. the full-page agent view).
 */
export interface OverlayGuard {
  /** Report whether a dismissable overlay is currently open. */
  setOverlayOpen: (open: boolean) => void;
  /** Read the latest overlay-open flag synchronously (for click handlers). */
  isOverlayOpen: () => boolean;
}

export const OverlayGuardContext = createContext<OverlayGuard>({
  setOverlayOpen: () => {},
  isOverlayOpen: () => false,
});

export const useOverlayGuard = (): OverlayGuard => useContext(OverlayGuardContext);
