import { useState } from 'react';
import { ChevronDown, Folder } from 'lucide-react';

import type { Agent, Project } from '../data/types.js';
import { AgentRow } from './AgentRow.js';

interface ProjectSectionProps {
  project: Project;
  agents: Agent[];
  onSelectAgent: (key: string) => void;
}

export function ProjectSection({ project, agents, onSelectAgent }: ProjectSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const active = agents.filter((a) => a.state !== 'finished').length;

  return (
    <section className="flex flex-col">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={`Toggle ${project.name}`}
        aria-expanded={!collapsed}
        className="flex items-center justify-between gap-3 border-b border-white/10 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`}
            aria-hidden
          />
          <Folder className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            {project.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {active} active · {agents.length} total
          </span>
        </span>
        <span className="font-mono text-xs text-muted-foreground">{project.repoPath}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-1.5 pt-1">
          {agents.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-muted-foreground">
              No agents yet — start one with{' '}
              <span className="font-mono text-muted-foreground">+ New Run</span>
            </div>
          ) : (
            agents.map((a) => <AgentRow key={a.key} agent={a} onSelect={onSelectAgent} />)
          )}
        </div>
      )}
    </section>
  );
}
