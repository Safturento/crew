import { dirname, join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDaemonConfig, type DaemonConfig } from './config.js';
import { createLogger } from './logger.js';
import { createDb, runMigrations } from './db.js';
import { buildApp } from './app.js';

/**
 * In container deployments the host's projects dir is bind-mounted at the
 * default `CREW_CONFIG_DIR` read-only, so we can't write fixture TOMLs there.
 * Redirect to a sibling of the DB file (the `/state` named volume in compose,
 * the test tmp dir under vitest) and seed into that — the host mount is
 * deliberately ignored in fixture mode anyway.
 */
function fixtureProjectsDir(dbFile: string): string {
  return join(dirname(dbFile), 'seeded-projects');
}

/**
 * Same RO-mount problem as `fixtureProjectsDir`: the host's
 * `~/.claude/projects` is bind-mounted read-only, so seeded JSONL transcripts
 * have to land under a writable path. The fixture mode also redirects
 * `transcriptsHome` so `resolveJsonlPath` reads from this same place.
 */
function fixtureTranscriptsHome(dbFile: string): string {
  return join(dirname(dbFile), 'seeded-transcripts');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_PATH = join(__dirname, 'migrations');
// `__dirname` is `packages/daemon/src/`; the dashboard's build lives at
// `packages/dashboard/dist/`. Resolved off `import.meta.url` rather than
// `process.cwd()` so the daemon can be launched from anywhere.
const DASHBOARD_DIST = resolve(__dirname, '..', '..', 'dashboard', 'dist');

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

  if (env.CREW_SEED_FIXTURES === '1') {
    // Worktree compose stacks set this so a fresh anonymous-volume DB
    // boots with realistic state instead of an empty agents list. The
    // dynamic import keeps fixture data out of the production hot path.
    const devMod = await import('./seeds/dev.js');
    logger.info('CREW_SEED_FIXTURES=1 — loading dev fixtures');
    await devMod.seedFixtures(db);

    config.configDir = fixtureProjectsDir(config.dbFile);
    mkdirSync(config.configDir, { recursive: true });
    devMod.seedProjectFixtures(config.configDir);

    // state_transitions and JSONL transcripts are seeded by their own
    // idempotent helpers — independent of `seedFixtures`'s agents-existence
    // gate — so a running daemon whose DB was populated by an older image
    // still picks up the new sections + drawer content on the next reload.
    // The `typeof` checks guard against an older in-image `seeds/dev.js`
    // that pre-dates these exports: skipping keeps the daemon serviceable
    // until the next rebuild rather than crashing on undefined call.
    if (typeof devMod.seedStateTransitionFixtures === 'function') {
      await devMod.seedStateTransitionFixtures(db);
    }
    if (typeof devMod.seedStartupEventsFixtures === 'function') {
      await devMod.seedStartupEventsFixtures(db);
    }
    if (typeof devMod.seedTranscriptFixtures === 'function') {
      config.transcriptsHome = fixtureTranscriptsHome(config.dbFile);
      mkdirSync(config.transcriptsHome, { recursive: true });
      devMod.seedTranscriptFixtures(config.transcriptsHome);
    }
  }

  const app = await buildApp({ config, logger, db, dashboardDistDir: DASHBOARD_DIST });
  await app.listen({ host: config.host, port: config.port });

  return { app, config };
}
