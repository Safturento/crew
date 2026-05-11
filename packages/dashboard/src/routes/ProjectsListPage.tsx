import { Plus } from 'lucide-react';

import type { Project } from '../data/types.js';
import { Button } from '../components/ui/button.js';
import { ProjectsTable } from '../components/ProjectsTable.js';

interface ProjectsListPageProps {
  projects: Project[];
}

export function ProjectsListPage({ projects }: ProjectsListPageProps) {
  return (
    <div className="mx-auto w-full max-w-[1240px] p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted-foreground">PROJECTS</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            /* Register modal lands in Epic 4 (project ops) */
          }}
          className="border-white/10 text-muted-foreground hover:bg-popover"
        >
          <Plus aria-hidden /> Register project
        </Button>
      </div>
      <ProjectsTable projects={projects} />
    </div>
  );
}
