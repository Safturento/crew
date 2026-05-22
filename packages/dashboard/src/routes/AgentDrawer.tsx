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
      <aside className="relative z-10 flex h-full w-full max-w-5xl flex-col bg-background shadow-2xl">
        <AgentBody agentKey={agentKey} mode="drawer" onClose={() => navigate('/')} />
      </aside>
    </div>
  );
}
