import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDaemonConfig, type DaemonConfig } from './config.js';
import { createLogger } from './logger.js';
import { createDb, runMigrations } from './db.js';
import { buildApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_PATH = join(__dirname, 'migrations');

/**
 * Boot the daemon end-to-end: parse config, ensure the state.db parent
 * directory exists, open the DB, run migrations, build the Fastify app,
 * and listen on `localhost:<port>`. Returns the running app so callers
 * can shut it down deterministically (e.g. on SIGTERM).
 */
export async function serve(env: NodeJS.ProcessEnv = process.env) {
  const config: DaemonConfig = parseDaemonConfig(env);
  const logger = createLogger();

  mkdirSync(dirname(config.dbFile), { recursive: true });
  const db = createDb(config.dbFile);
  await runMigrations(db, MIGRATIONS_PATH);

  const app = await buildApp({ config, logger, db });
  await app.listen({ host: '127.0.0.1', port: config.port });

  return { app, config };
}
