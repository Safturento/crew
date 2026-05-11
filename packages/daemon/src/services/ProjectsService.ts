import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseProjectConfig, type ProjectConfig } from 'crew-shared';
import type { Logger } from 'pino';
import { NotFoundError } from '../errors.js';

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

interface ProjectFileEntry {
  filePath: string;
  config: ProjectConfig;
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
    const entries = this.scanValidProjectFiles();
    const counts = await this.agentsService.countByProject();
    return entries
      .map(({ config }) => ({
        name: config.name,
        repoPath: config.repo_path,
        branch: config.default_branch,
        jiraKey: config.jira.project_key,
        activeCount: counts.get(config.name) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Returns the full ProjectConfig for a slug. Slug is matched against the
   * inner `cfg.name` field — the same identifier `list()` exposes — so a
   * filename that diverges from `name` doesn't break the lookup. Throws
   * `NotFoundError` (mapped to HTTP 404) when no project matches.
   */
  getBySlug(slug: string): ProjectConfig {
    const entry = this.findEntryBySlug(slug);
    if (!entry) {
      throw new NotFoundError('project_not_found', { resource: 'project', id: slug });
    }
    return entry.config;
  }

  /**
   * Returns the absolute file path that backs a given slug. Throws
   * `NotFoundError` when no project matches — same contract as `getBySlug`
   * so the route handler can rely on a single error path.
   */
  getConfigPath(slug: string): string {
    const entry = this.findEntryBySlug(slug);
    if (!entry) {
      throw new NotFoundError('project_not_found', { resource: 'project', id: slug });
    }
    return entry.filePath;
  }

  private findEntryBySlug(slug: string): ProjectFileEntry | undefined {
    return this.scanValidProjectFiles().find(({ config }) => config.name === slug);
  }

  private scanValidProjectFiles(): ProjectFileEntry[] {
    if (!existsSync(this.projectsDir)) return [];
    const entries: ProjectFileEntry[] = [];
    for (const file of readdirSync(this.projectsDir)) {
      if (!file.endsWith('.toml')) continue;
      const filePath = join(this.projectsDir, file);
      try {
        const config = parseProjectConfig(readFileSync(filePath, 'utf8'));
        entries.push({ filePath, config });
      } catch (err) {
        this.logger.warn({ path: filePath, err }, 'skipping invalid project TOML');
      }
    }
    return entries;
  }
}
