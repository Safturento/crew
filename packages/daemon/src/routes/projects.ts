import { z } from 'zod';
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

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectsResponse = z.infer<typeof ProjectsResponseSchema>;

/**
 * Registers `GET /api/projects`. Resolves `projectsService` from the
 * Awilix scope and returns its alphabetized list with the joined
 * activeCount column. Response is validated by the Zod serializer
 * compiler so a divergent shape fails loudly in tests rather than at the
 * dashboard.
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
}
