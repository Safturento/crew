import { projectConfigSchema } from 'crew-shared';
import { fail, ok, type HealthCheck } from '../types.js';

/**
 * Re-validate the loaded project config against the shared zod schema.
 *
 * Schema-agnostic by design: it delegates entirely to `projectConfigSchema`,
 * so when the schema gains or loses fields this check tracks it automatically.
 * No `fix()` — re-authoring the config is `crew init`'s job.
 */
export const configValid: HealthCheck = {
  name: 'config-valid',
  scope: 'project',
  detect: async ({ config }) => {
    const parsed = projectConfigSchema.safeParse(config);
    if (parsed.success) return ok('project config is valid');

    const summary = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');

    return fail(`project config is invalid: ${summary}`, {
      remediation: 'run crew init to re-author the project config',
      details: { issues: summary },
    });
  },
};
