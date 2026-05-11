import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseProjectConfig } from 'crew-shared';
import type { Logger } from 'pino';

export interface ProjectSummary {
  name: string;
  repoPath: string;
  branch: string;
  jiraKey: string;
  activeCount: number;
}

/**
 * Shape of the agents-side dependency that ProjectsService uses to derive
 * `activeCount`. Defined here (not imported from AgentsService) so tests can
 * substitute an in-memory stub without the DB-backed AgentsService dragging
 * its migration machinery into ProjectsService's unit tests.
 */
export interface AgentsCounter {
  countByProject(): Promise<Map<string, number>>;
}

export interface ProjectsServiceDeps {
  projectsDir: string;
  logger: Logger;
  agentsService: AgentsCounter;
}

/**
 * Reads `<projectsDir>/*.toml` and returns one `ProjectSummary` per valid
 * file. Invalid TOMLs are logged at warn level and skipped — one bad file
 * must not break the whole list. Non-`.toml` files are ignored. Returns
 * `[]` when `projectsDir` does not exist (the daemon may run before any
 * project has been registered). `activeCount` is joined in via a single
 * `agentsService.countByProject()` call so we never N+1 the per-project
 * count.
 */
export class ProjectsService {
  private readonly projectsDir: string;
  private readonly logger: Logger;
  private readonly agentsService: AgentsCounter;

  constructor(deps: ProjectsServiceDeps) {
    this.projectsDir = deps.projectsDir;
    this.logger = deps.logger;
    this.agentsService = deps.agentsService;
  }

  async list(): Promise<ProjectSummary[]> {
    if (!existsSync(this.projectsDir)) return [];

    interface ParsedProject {
      name: string;
      repoPath: string;
      branch: string;
      jiraKey: string;
    }
    const parsed: ParsedProject[] = [];
    for (const file of readdirSync(this.projectsDir)) {
      if (!file.endsWith('.toml')) continue;
      const path = join(this.projectsDir, file);
      try {
        const cfg = parseProjectConfig(readFileSync(path, 'utf8'));
        parsed.push({
          name: cfg.name,
          repoPath: cfg.repo_path,
          branch: cfg.default_branch,
          jiraKey: cfg.jira.project_key,
        });
      } catch (err) {
        this.logger.warn({ path, err }, 'skipping invalid project TOML');
      }
    }

    const counts = await this.agentsService.countByProject();
    return parsed
      .map((p) => ({ ...p, activeCount: counts.get(p.name) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
