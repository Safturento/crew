import type { Project } from '../data/types.js';
import { PROJECT_ROW_GRID, ProjectRow } from './ProjectRow.js';

interface ProjectsTableProps {
  projects: Project[];
}

export function ProjectsTable({ projects }: ProjectsTableProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-muted-foreground">
        No projects registered yet — register one with{' '}
        <span className="font-mono text-muted-foreground">crew project register</span>.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="row"
        aria-label="Column headers"
        className={`grid items-center gap-4 ${PROJECT_ROW_GRID} px-4 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground`}
      >
        <span>Name</span>
        <span>Repo</span>
        <span>Branch</span>
        <span>Jira</span>
        <span>Active</span>
        <span className="sr-only">Open</span>
      </div>
      {projects.map((p) => (
        <ProjectRow key={p.name} project={p} />
      ))}
    </div>
  );
}
