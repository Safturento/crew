import { z } from 'zod';
import { projectConfigSchema, projectTicketsResponseSchema } from 'crew-shared';
import type { DaemonApp } from '../app.js';

const ProjectSchema = z.object({
  name: z.string(),
  repoPath: z.string(),
  branch: z.string(),
  jiraKey: z.string(),
  activeCount: z.number(),
});

const ProjectsResponseSchema = z.object({
  projects: z.array(ProjectSchema),
});

const SlugParamsSchema = z.object({ slug: z.string().min(1) });

const ProjectDetailResponseSchema = z.object({
  project: projectConfigSchema,
  configPath: z.string(),
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectsResponse = z.infer<typeof ProjectsResponseSchema>;
export type ProjectDetailResponse = z.infer<typeof ProjectDetailResponseSchema>;

/**
 * Registers `GET /api/projects` and `GET /api/projects/:slug`. Both
 * resolve `projectsService` from the Awilix scope. The list endpoint
 * returns the alphabetized summary with the joined `activeCount` column;
 * the detail endpoint surfaces the full ProjectConfig plus the on-disk
 * file path so the dashboard can format the source TOML alongside the
 * config. Response shapes are validated by the Zod serializer compiler
 * so a divergent shape fails loudly in tests rather than at the
 * dashboard.
 *
 * The `:slug` matches the inner `cfg.name` field (the same identifier
 * `list()` exposes). Unknown slugs throw `NotFoundError` from the
 * service, mapped to HTTP 404 by the central error handler in `app.ts`.
 */
export async function registerProjectsRoutes(app: DaemonApp): Promise<void> {
  app.get(
    '/api/projects',
    {
      schema: { response: { 200: ProjectsResponseSchema } },
    },
    async (req) => {
      const svc = req.diScope.resolve('projectsService');
      return { projects: await svc.list() };
    },
  );

  app.get(
    '/api/projects/:slug',
    {
      schema: {
        params: SlugParamsSchema,
        response: { 200: ProjectDetailResponseSchema },
      },
    },
    async (req) => {
      const svc = req.diScope.resolve('projectsService');
      const project = svc.getBySlug(req.params.slug);
      const configPath = svc.getConfigPath(req.params.slug);
      return { project, configPath };
    },
  );

  // CREW-278: New Run ticket picker data path. `getBySlug` throws NotFoundError
  // (→ 404) for an unknown slug before any Jira call; a degraded list (missing
  // creds / Jira unreachable) is a 200 with `available: false`, never a 5xx.
  app.get(
    '/api/projects/:slug/tickets',
    {
      schema: {
        params: SlugParamsSchema,
        response: { 200: projectTicketsResponseSchema },
      },
    },
    async (req) => {
      const project = req.diScope.resolve('projectsService').getBySlug(req.params.slug);
      return req.diScope.resolve('ticketsService').listProjectTickets(project);
    },
  );
}
