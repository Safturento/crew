import { z } from 'zod';

export const projectConfigSchema = z.object({
  name: z.string(),
  repo_path: z.string(),
  default_branch: z.string().default('main'),
  jira: z.object({
    project_key: z.string(),
    site: z.url(),
  }),
  github: z.object({
    repo: z.string(),
  }),
  docker: z
    .object({
      canonical_worktree: z.string(),
      http_port_base: z.number().default(8000),
      https_port_base: z.number().default(8400),
      postgres_port_base: z.number().default(15400),
    })
    .optional(),
  sandbox: z
    .object({
      allowed_domains: z.array(z.string()),
    })
    .optional(),
  db_clone: z
    .object({
      postgres_service: z.string().default('postgres'),
      postgres_user: z.string().default('postgres'),
      postgres_database: z.string().default('postgres'),
      required_tables: z.array(z.string()).default([]),
      exclude_tables: z.array(z.string()).default(['kysely_migration*']),
    })
    .prefault({}),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
