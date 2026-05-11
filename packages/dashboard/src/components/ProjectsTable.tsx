import type { Project } from '../data/types.js';
import { PROJECT_ROW_GRID, ProjectRow } from './ProjectRow.js';

interface ProjectsTableProps {
  projects: Project[];
}

export function ProjectsTable({ projects }: ProjectsTableProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded border border-dashed border-white/10 px-4 py-10 text-center text-sm text-muted-foreground">
        No projects registered yet — register one with{' '}
        <span className="font-mono text-muted-foreground">crew project register</span>.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-white/10 bg-card">
      <div
        role="row"
        aria-label="Column headers"
        className={`grid items-center gap-4 ${PROJECT_ROW_GRID} border-b border-white/10 bg-muted/40 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground`}
      >
        <span>Name</span>
        <span>Repo path</span>
        <span>Branch</span>
        <span>Jira</span>
        <span>Active</span>
        <span className="sr-only">Open</span>
      </div>
      <div className="divide-y divide-white/5">
        {projects.map((p) => (
          <ProjectRow key={p.name} project={p} />
        ))}
      </div>
    </div>
  );
}
