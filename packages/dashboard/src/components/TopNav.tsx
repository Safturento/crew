import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';

import type { Route } from '../routing/parseRoute.js';
import { BrandMark } from './BrandMark.js';
import { Button } from './ui/button.js';

interface TopNavProps {
  route: Route;
  attentionCount: number;
  onClearAttention: () => void;
  onNewRun: () => void;
}

export function TopNav({ route, attentionCount, onClearAttention, onNewRun }: TopNavProps) {
  const agentsActive =
    route.kind === 'agents-list' || route.kind === 'agent-drawer' || route.kind === 'agent-full';
  const projectsActive = route.kind === 'projects' || route.kind === 'project-detail';

  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-card px-5 py-3">
      <div className="flex items-center gap-6">
        <a href="#/" className="flex items-center gap-2 text-foreground">
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
        <Button
          variant="outline"
          size="xs"
          onClick={onClearAttention}
          disabled={attentionCount === 0}
          className="border-white/10 text-muted-foreground hover:bg-popover disabled:opacity-40"
        >
          Clear attention
          {attentionCount > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-state-waiting px-1.5 text-[10px] font-semibold text-slate-950">
              {attentionCount}
            </span>
          )}
        </Button>
        <Button
          variant="default"
          size="xs"
          onClick={onNewRun}
          className="bg-foreground font-semibold text-background hover:bg-foreground/90"
        >
          <Plus aria-hidden /> New Run
        </Button>
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
        active ? 'bg-popover text-foreground' : 'text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </a>
  );
}
