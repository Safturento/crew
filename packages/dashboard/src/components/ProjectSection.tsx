import { useState } from 'react';
import type { MouseEvent } from 'react';
import { ChevronDown, ExternalLink, Folder } from 'lucide-react';

import type { Agent, Project } from '@/data/types';
import { AgentRow, type QuickActionKind } from './AgentRow.js';
import { Button } from './ui/button.js';

interface ProjectSectionProps {
  project: Project;
  agents: Agent[];
  onSelectAgent: (key: string) => void;
  onAgentAction?: (kind: QuickActionKind, agent: Agent) => void;
  onOpenProject?: (name: string) => void;
  showHeader?: boolean;
}

export function ProjectSection({
  project,
  agents,
  onSelectAgent,
  onAgentAction,
  onOpenProject,
  showHeader = true,
}: ProjectSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const active = agents.filter((a) => a.state !== 'finished').length;

  const handleOpenProject = (e: MouseEvent) => {
    e.stopPropagation();
    onOpenProject?.(project.name);
  };

  const body = (
    <div className="flex flex-col gap-2 pt-1">
      {agents.length === 0 ? (
        <div className="rounded border border-dashed border-white/10 px-4 py-6 text-center text-sm text-muted-foreground">
          No agents yet — start one with{' '}
          <span className="font-mono text-muted-foreground">+ New Run</span>
        </div>
      ) : (
        agents.map((a) => (
          <AgentRow key={a.key} agent={a} onSelect={onSelectAgent} onAction={onAgentAction} />
        ))
      )}
    </div>
  );

  if (!showHeader) {
    return <section className="flex flex-col">{body}</section>;
  }

  return (
    <section className="flex flex-col">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((c) => !c)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
        aria-label={`Toggle ${project.name}`}
        aria-expanded={!collapsed}
        className="group/header flex cursor-pointer items-center justify-between gap-3 border-b border-white/10 py-2 text-left"
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
          {onOpenProject && (
            <Button
              color="running"
              intensity="ghost"
              size="xs"
              icon={<ExternalLink aria-hidden />}
              aria-label="Open project page"
              title="Open project page"
              onClick={handleOpenProject}
              className="opacity-0 transition-opacity group-hover/header:opacity-100 focus-visible:opacity-100"
            />
          )}
          <span className="text-xs text-muted-foreground">
            {active} active · {agents.length} total
          </span>
        </span>
        <span className="font-mono text-xs text-muted-foreground">{project.repoPath}</span>
      </div>
      {!collapsed && body}
    </section>
  );
}
