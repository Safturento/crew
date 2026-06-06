import { createContext, useContext } from 'react';

/**
 * Lets nested overlays (e.g. the Timeline Filters popover) tell the drawer
 * backdrop to ignore the click that dismissed them, so dismissing an overlay
 * doesn't also close the whole drawer. No-op default so consuming components
 * still work when rendered outside a drawer (e.g. the full-page view, tests).
 */
export interface OverlayGuard {
  setOverlayOpen: (open: boolean) => void;
  isOverlayOpen: () => boolean;
}

export const OverlayGuardContext = createContext<OverlayGuard>({
  setOverlayOpen: () => {},
  isOverlayOpen: () => false,
});

export const useOverlayGuard = (): OverlayGuard => useContext(OverlayGuardContext);
