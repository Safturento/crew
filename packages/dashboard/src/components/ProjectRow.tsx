import { ChevronRight } from 'lucide-react';

import type { Project } from '../data/types.js';
import { Badge } from './ui/badge.js';

interface ProjectRowProps {
  project: Project;
}

export const PROJECT_ROW_GRID = 'grid-cols-[1fr_1.5fr_0.7fr_0.5fr_60px_24px]';

export function ProjectRow({ project }: ProjectRowProps) {
  return (
    <a
      href={`#/projects/${project.name}`}
      aria-label={`Open ${project.name}`}
      className={`grid items-center gap-4 ${PROJECT_ROW_GRID} px-4 py-3 transition-colors hover:bg-popover`}
    >
      <span className="truncate text-sm font-semibold tracking-tight text-foreground">
        {project.name}
      </span>
      <span className="truncate font-mono text-xs text-muted-foreground">{project.repoPath}</span>
      <span className="truncate font-mono text-xs text-muted-foreground">{project.branch}</span>
      <span className="truncate font-mono text-xs text-muted-foreground">{project.jiraKey}</span>
      {project.activeCount > 0 ? (
        <Badge color="initializing" intensity="mid">
          {project.activeCount}
        </Badge>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">0</span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
    </a>
  );
}
