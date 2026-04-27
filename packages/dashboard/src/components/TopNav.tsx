import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';

import type { Route } from '../routing/parseRoute.js';
import { BrandMark } from './BrandMark.js';

interface TopNavProps {
  route: Route;
  attentionCount: number;
  onClearAttention: () => void;
  onNewRun: () => void;
}

export function TopNav({ route, attentionCount, onClearAttention, onNewRun }: TopNavProps) {
  const agentsActive = route.kind === 'agents-list' || route.kind === 'agent-detail';
  const projectsActive = route.kind === 'projects';

  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-surface px-5 py-3">
      <div className="flex items-center gap-6">
        <a href="#/" className="flex items-center gap-2 text-text">
          <BrandMark className="h-[22px] w-[22px] text-state-running" />
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">crew</span>
        </a>
        <nav className="flex items-center gap-1">
          <NavTab href="#/" active={agentsActive}>
            Agents
          </NavTab>
          <NavTab href="#/projects" active={projectsActive}>
            Projects
          </NavTab>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClearAttention}
          disabled={attentionCount === 0}
          className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-1.5 text-xs text-text-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear attention
          {attentionCount > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-state-waiting px-1.5 text-[10px] font-semibold text-slate-950">
              {attentionCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onNewRun}
          className="flex items-center gap-1.5 rounded-md bg-text px-3 py-1.5 text-xs font-semibold text-canvas hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> New Run
        </button>
      </div>
    </header>
  );
}

function NavTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={[
        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-surface-2 text-text' : 'text-text-2 hover:text-text',
      ].join(' ')}
    >
      {children}
    </a>
  );
}
