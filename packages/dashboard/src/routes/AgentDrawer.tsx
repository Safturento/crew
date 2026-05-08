import { useEffect } from 'react';

import { AgentBody } from '../components/AgentBody.js';
import { navigate } from '../routing/useHashRoute.js';

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Agent detail"
      className="fixed inset-0 z-50 flex justify-end"
    >
      <div
        data-testid="drawer-backdrop"
        aria-hidden
        onClick={() => navigate('/')}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <aside className="relative z-10 flex h-full w-full max-w-[920px] flex-col bg-bg shadow-2xl">
        <button
          type="button"
          aria-label="Close drawer"
          onClick={() => navigate('/')}
          className="absolute right-3 top-3 z-10 rounded-md border border-white/10 bg-surface px-2 py-1 text-xs text-text-2 hover:bg-surface-2"
        >
          Close ✕
        </button>
        <AgentBody agentKey={agentKey} mode="drawer" />
      </aside>
    </div>
  );
}
