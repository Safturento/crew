import { useEffect, useRef } from 'react';

import { AgentBody } from '../components/AgentBody.js';
import { navigate } from '../routing/useHashRoute.js';
import { OverlayGuardContext, type OverlayGuard } from './overlay-guard.js';

interface AgentDrawerProps {
  agentKey: string;
}

export function AgentDrawer({ agentKey }: AgentDrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        navigate('/');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A ref (not state) so the backdrop's click handler reads the latest value
  // synchronously, without a re-render between an overlay's dismiss and the
  // click that dismissed it.
  const overlayOpenRef = useRef(false);
  const guard: OverlayGuard = {
    setOverlayOpen: (next) => {
      overlayOpenRef.current = next;
    },
    isOverlayOpen: () => overlayOpenRef.current,
  };

  const onBackdrop = () => {
    // If an overlay (e.g. the Filters popover) was open when this click landed,
    // treat the click as the overlay's dismiss and keep the drawer open. The
    // overlay defers clearing the flag to the next tick, so it's still true here.
    if (overlayOpenRef.current) return;
    navigate('/');
  };

  return (
    <OverlayGuardContext.Provider value={guard}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agent detail"
        className="fixed inset-0 z-50 flex justify-end"
      >
        <div
          data-testid="drawer-backdrop"
          aria-hidden
          onClick={onBackdrop}
          className="absolute inset-0 cursor-default bg-black/40"
        />
        <aside className="relative z-10 flex h-full w-full max-w-5xl flex-col bg-background shadow-2xl">
          <AgentBody agentKey={agentKey} mode="drawer" onClose={() => navigate('/')} />
        </aside>
      </div>
    </OverlayGuardContext.Provider>
  );
}
