import { z } from 'zod';

const PORT_PLACEHOLDERS = ['{httpPort}', '{httpsPort}', '{postgresPort}'] as const;

const visualTestingSchema = z.object({
  enabled: z.literal(true),
  app_url: z.string().min(1),
  start_command: z.string().min(1).optional(),
  authored: z
    .object({
      tests_dir: z.string().min(1),
      test_command: z.string().min(1),
    })
    .optional(),
});

export const projectConfigSchema = z
  .object({
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
    visual_testing: visualTestingSchema.optional(),
  })
  .superRefine((cfg, ctx) => {
    const vt = cfg.visual_testing;
    if (!vt) return;

    const usesPortPlaceholder = PORT_PLACEHOLDERS.some((p) => vt.app_url.includes(p));
    if (usesPortPlaceholder && !cfg.docker) {
      ctx.addIssue({
        code: 'custom',
        path: ['visual_testing', 'app_url'],
        message: `app_url uses a port placeholder (${PORT_PLACEHOLDERS.join(', ')}) but no [docker] section is configured`,
      });
    }

    if (!vt.start_command && !cfg.docker) {
      ctx.addIssue({
        code: 'custom',
        path: ['visual_testing', 'start_command'],
        message:
          'start_command is required when [docker] is not configured (the agent needs a command to bring the app up)',
      });
    }
  });

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
