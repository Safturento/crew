import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InitAnswers } from './types.js';

const DEFAULT_DAEMON_PORT = 7773;
const DEFAULT_DASHBOARD_PORT = 5173;

/**
 * Scaffold the repo `env.toml` — the per-worktree env materialization spec
 * (`env-spec`, schema = 1). Hand-authored as a string (inline tables) so the
 * result reads like the canonical crew `env.toml` a human will edit, rather
 * than the expanded sub-table form a serializer would emit.
 *
 * Seeds `DAEMON_PORT` / `DASHBOARD_PORT` and the `APP_URL` / `DAEMON_URL`
 * templates the project TOML's `${APP_URL}` / `${DAEMON_URL}` refs resolve
 * against. `crew env init` later materializes these into `.env`.
 *
 * @param answers   the wizard answers (only `ports` is consulted here)
 * @param worktree  the repo root to write `env.toml` into
 * @returns the absolute path written
 */
/**
 * Render the `env.toml` spec to a string without writing it. The single source
 * of truth for the file's content; `writeEnvToml` writes its output, and
 * `crew init`'s converge step renders prospective content here to diff against
 * the on-disk file before deciding whether to (re)write.
 */
export function renderEnvToml(answers: InitAnswers): string {
  const daemon = answers.ports?.daemon ?? DEFAULT_DAEMON_PORT;
  const dashboard = answers.ports?.dashboard ?? DEFAULT_DASHBOARD_PORT;

  return `schema = 1

[orchestration]
COMPOSE_PROJECT_NAME = { kind = "template", value = "\${BASE_NAME}-\${WORKTREE_ID}" }
DAEMON_PORT          = { kind = "port", default = ${daemon} }
DASHBOARD_PORT       = { kind = "port", default = ${dashboard} }
APP_URL              = { kind = "template", value = "http://localhost:\${DASHBOARD_PORT}" }
DAEMON_URL           = { kind = "template", value = "http://localhost:\${DAEMON_PORT}" }
`;
}

export function writeEnvToml(answers: InitAnswers, worktree: string): string {
  const dest = join(worktree, 'env.toml');
  writeFileSync(dest, renderEnvToml(answers), 'utf8');
  return dest;
}
