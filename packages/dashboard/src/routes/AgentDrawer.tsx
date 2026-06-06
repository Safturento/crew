import { useEffect, useRef } from 'react';

import { AgentBody } from '../components/AgentBody.js';
import { navigate } from '../routing/useHashRoute.js';
import { OverlayGuardContext, type OverlayGuard } from './overlay-guard.js';

interface AgentDrawerProps {
  agentKey: string;
}

export function AgentDrawer({ agentKey }: AgentDrawerProps) {
  // A nested overlay (the Filters popover) renders in a Radix portal; clicking
  // outside it to dismiss lands on this backdrop. Track whether an overlay was
  // open via a ref so the backdrop's click handler can read the latest value
  // synchronously and skip the navigate when the click was an overlay dismiss.
  const overlayOpenRef = useRef(false);
  const guard: OverlayGuard = {
    setOverlayOpen: (open) => {
      overlayOpenRef.current = open;
    },
    isOverlayOpen: () => overlayOpenRef.current,
  };

  const onBackdrop = () => {
    // The overlay defers flipping the ref false to the next tick, so a click
    // that dismissed an open overlay still reads `true` here — keep the drawer.
    if (overlayOpenRef.current) return;
    navigate('/');
  };

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
