import { z } from 'zod';
import type { Project } from './types.js';

const ProjectsResponseSchema = z.object({
  projects: z.array(
    z.object({
      name: z.string(),
      repoPath: z.string(),
    }),
  ),
});

export class HttpProjectsClient {
  constructor(private readonly baseUrl: string = '') {}

  async listProjects(): Promise<Project[]> {
    const res = await fetch(`${this.baseUrl}/api/projects`, { method: 'GET' });
    if (!res.ok) throw new Error(`GET /api/projects: ${res.status}`);
    const json = (await res.json()) as unknown;
    const parsed = ProjectsResponseSchema.parse(json);
    return parsed.projects;
  }
}
