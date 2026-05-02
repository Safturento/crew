import { z } from 'zod';

export const ENV_SPEC_SCHEMA_VERSION = 1;

const orchestrationPort = z.object({
  kind: z.literal('port'),
  default: z.number().int().positive().optional(),
});

const orchestrationTemplate = z.object({
  kind: z.literal('template'),
  value: z.string(),
});

const orchestrationEntry = z.discriminatedUnion('kind', [orchestrationPort, orchestrationTemplate]);

const appLiteral = z.strictObject({
  source: z.literal('literal'),
  value: z.string(),
});

const appGenerate = z.strictObject({
  source: z.literal('generate'),
  command: z.string().min(1),
  share: z.boolean().optional(),
});

const appEntry = z.discriminatedUnion('source', [appLiteral, appGenerate]);

const fileEntry = z.object({
  path: z.string().min(1),
  generator: z.string().min(1),
  env_var: z.string().min(1).optional(),
});

const contextOverrides = z.record(z.string(), z.string());

export const envSpecSchema = z.object({
  schema: z.literal(ENV_SPEC_SCHEMA_VERSION),
  orchestration: z.record(z.string(), orchestrationEntry).default({}),
  app: z.record(z.string(), appEntry).default({}),
  files: z.record(z.string(), fileEntry).default({}),
  contexts: z.record(z.string(), contextOverrides).default({}),
});

export type EnvSpec = z.infer<typeof envSpecSchema>;
export type OrchestrationEntry = z.infer<typeof orchestrationEntry>;
export type AppEntry = z.infer<typeof appEntry>;
export type FileEntry = z.infer<typeof fileEntry>;
