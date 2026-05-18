import type { Project } from '../data/types.js';
import { Button } from '../components/ui/button.js';
import { ProjectsTable } from '../components/ProjectsTable.js';

interface ProjectsListPageProps {
  projects: Project[];
}

export function ProjectsListPage({ projects }: ProjectsListPageProps) {
  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
        <Button
          color="running"
          intensity="mid"
          size="sm"
          onClick={() => {
            /* Register modal lands in Epic 4 (project ops) */
          }}
        >
          Register project
        </Button>
      </div>
      <ProjectsTable projects={projects} />
    </div>
  );
}
