import { Button } from './ui/button.js';

interface ProjectHeaderProps {
  name: string;
  configPath: string;
}

export function ProjectHeader({ name, configPath }: ProjectHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <a
          href="#/projects"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ← Projects
        </a>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
        <p className="font-mono text-xs text-muted-foreground">{configPath}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          color="white"
          intensity="mid"
          size="sm"
          onClick={() => {
            /* TODO (Epic 4): wire to Edit modal */
          }}
        >
          Edit
        </Button>
        <Button
          color="error"
          intensity="loud"
          size="sm"
          onClick={() => {
            /* TODO (Epic 4): wire to Remove modal */
          }}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}
