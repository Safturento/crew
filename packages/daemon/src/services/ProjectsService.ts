import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseProjectConfig } from 'crew-shared';
import type { Logger } from 'pino';

export interface ProjectSummary {
  name: string;
  repoPath: string;
}

/**
 * Reads `<projectsDir>/*.toml` and returns one `ProjectSummary` per valid
 * file. Invalid TOMLs are logged at warn level and skipped — one bad file
 * must not break the whole list. Non-`.toml` files are ignored. Returns
 * `[]` when `projectsDir` does not exist (the daemon may run before any
 * project has been registered).
 */
export class ProjectsService {
  private readonly projectsDir: string;
  private readonly logger: Logger;

  constructor(deps: { projectsDir: string; logger: Logger }) {
    this.projectsDir = deps.projectsDir;
    this.logger = deps.logger;
  }

  list(): ProjectSummary[] {
    if (!existsSync(this.projectsDir)) return [];
    const projects: ProjectSummary[] = [];
    for (const file of readdirSync(this.projectsDir)) {
      if (!file.endsWith('.toml')) continue;
      const path = join(this.projectsDir, file);
      try {
        const cfg = parseProjectConfig(readFileSync(path, 'utf8'));
        projects.push({ name: cfg.name, repoPath: cfg.repo_path });
      } catch (err) {
        this.logger.warn({ path, err }, 'skipping invalid project TOML');
      }
    }
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }
}
