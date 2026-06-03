import { z } from 'zod';

const PORT_PLACEHOLDERS = ['{httpPort}', '{httpsPort}', '{postgresPort}'] as const;

const playwrightSmokeSchema = z.object({
  enabled: z.literal(true),
});

const playwrightAuthoredSchema = z.object({
  enabled: z.literal(true),
  tests_dir: z.string().min(1),
  test_command: z.string().min(1),
  verify_after_run: z.boolean().default(false),
  verify_max_attempts: z.number().int().min(1).default(2),
});

const playwrightSchema = z.object({
  app_url: z.string().min(1),
  start_command: z.string().min(1).optional(),
  smoke: playwrightSmokeSchema.optional(),
  authored: playwrightAuthoredSchema.optional(),
});

const visualFidelitySchema = z.object({
  figma_file_key: z.string().min(1),
  figma_pages: z.array(z.string()).min(1),
  component_dir: z.string().min(1),
  dashboard_url: z.string().min(1),
  snapshot_path: z.string().min(1).default('.crew/figma-snapshot'),
  code_connect_glob: z.string().min(1).default('**/*.figma.tsx'),
});

const brunoSmokeSchema = z.object({
  enabled: z.literal(true),
  base_url: z.string().min(1),
  collection_dir: z.string().min(1).default('bruno'),
  smoke_user: z
    .object({
      email: z.string().min(1),
      username: z.string().min(1),
      password: z.string().min(1),
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
        caddy_service: z.string().default('caddy'),
        postgres_service: z.string().default('postgres'),
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
    playwright: playwrightSchema.optional(),
    bruno_smoke: brunoSmokeSchema.optional(),
    visual_fidelity: visualFidelitySchema.optional(),
  })
  .superRefine((cfg, ctx) => {
    const pw = cfg.playwright;
    if (pw) {
      const smokeOn = Boolean(pw.smoke?.enabled);
      const authoredOn = Boolean(pw.authored?.enabled);
      if (!smokeOn && !authoredOn) {
        ctx.addIssue({
          code: 'custom',
          path: ['playwright'],
          message:
            'at least one of [playwright.smoke] or [playwright.authored] must be enabled when [playwright] is configured',
        });
      }

      const usesPortPlaceholder = PORT_PLACEHOLDERS.some((p) => pw.app_url.includes(p));
      if (usesPortPlaceholder && !cfg.docker) {
        ctx.addIssue({
          code: 'custom',
          path: ['playwright', 'app_url'],
          message: `app_url uses a port placeholder (${PORT_PLACEHOLDERS.join(', ')}) but no [docker] section is configured`,
        });
      }

      if (!pw.start_command && !cfg.docker) {
        ctx.addIssue({
          code: 'custom',
          path: ['playwright', 'start_command'],
          message:
            'start_command is required when [docker] is not configured (the agent needs a command to bring the app up)',
        });
      }
    }

    const bs = cfg.bruno_smoke;
    if (bs) {
      const usesPortPlaceholder = PORT_PLACEHOLDERS.some((p) => bs.base_url.includes(p));
      if (usesPortPlaceholder && !cfg.docker) {
        ctx.addIssue({
          code: 'custom',
          path: ['bruno_smoke', 'base_url'],
          message: `base_url uses a port placeholder (${PORT_PLACEHOLDERS.join(', ')}) but no [docker] section is configured`,
        });
      }
    }
  });

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
