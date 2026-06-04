import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify';
import fastifyStatic from '@fastify/static';
import { fastifyAwilixPlugin } from '@fastify/awilix';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { DaemonConfig } from './config.js';
import type { DaemonDatabase } from './db.js';
import { ConfigDirNotFoundError, ConflictError, NotFoundError } from './errors.js';
import { buildContainer } from './container.js';
import { registerProjectsRoutes } from './routes/projects.js';
import { registerAgentsRoutes } from './routes/agents.js';
import { registerRunsRoutes } from './routes/runs.js';
import { registerEventsRoutes } from './routes/events.js';
import { registerMetricsRoutes } from './routes/metrics.js';
import { registerActionsRoutes } from './routes/actions.js';

const PLACEHOLDER_HTML = `<!DOCTYPE html>
<html>
  <head><title>crew daemon</title></head>
  <body style="font-family: system-ui; padding: 2rem;">
    <h1>crew daemon</h1>
    <p>dashboard not built — run <code>npm run build --workspace=crew-dashboard</code></p>
  </body>
</html>
`;

/**
 * The Fastify instance shape returned by `buildApp` — a pino logger plus
 * the Zod type provider so route files declaring Zod schemas in their
 * `schema` blocks compile against this exact instance type.
 */
export type DaemonApp = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  Logger,
  ZodTypeProvider
>;

function getValidation(err: Error): FastifyError['validation'] | undefined {
  const candidate = (err as { validation?: unknown }).validation;
  return Array.isArray(candidate) ? (candidate as FastifyError['validation']) : undefined;
}

export interface BuildAppOptions {
  config: DaemonConfig;
  logger: Logger;
  db: Kysely<DaemonDatabase>;
  /**
   * Absolute path to the dashboard's built dist directory. When present
   * AND it contains `index.html`, the daemon serves static assets at `/`
   * with an SPA fallback to `index.html` for unknown non-`/api` routes.
   * When absent or unbuilt, `/` serves a placeholder pointing the user
   * at the dashboard build command. `/api/*` always returns JSON 404 on
   * unknown routes regardless of the dist state.
   */
  dashboardDistDir?: string;
}

/**
 * Build a configured Fastify instance with the daemon's DI container,
 * central error handler, and routes registered. The caller starts the
 * server (or calls `app.inject` in tests) and is responsible for
 * `app.close()` on shutdown.
 */
export async function buildApp({
  config,
  logger,
  db,
  dashboardDistDir,
}: BuildAppOptions): Promise<DaemonApp> {
  const app: DaemonApp = Fastify({ loggerInstance: logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const container = buildContainer({ config, logger, db });
  await app.register(fastifyAwilixPlugin, {
    container,
    disposeOnClose: true,
    disposeOnResponse: false,
    asyncInit: false,
    asyncDispose: false,
    strictBooleanEnforced: true,
  });

  // Resolve via the container's cradle (not request-scoped) — the ingest
  // service is a singleton owned by the daemon process. start() runs the
  // crash-recovery path that re-attaches tails for runs that didn't get
  // a `complete` call before the previous boot exited.
  const ingest = container.cradle.ingestService;
  // CREW-202: PrPoller is also a singleton; lifecycle hooked alongside.
  const prPoller = container.cradle.prPoller;
  // Tests build the app inside vitest, where shelling out to `gh` is both
  // noise (real network) and a source of flakiness (it can publish SSE
  // events mid-test). Vitest sets `VITEST=true`; CREW_PR_POLLER_DISABLED
  // is also honored for non-vitest test runners or local debugging.
  const prPollerDisabled =
    process.env.VITEST === 'true' || process.env.CREW_PR_POLLER_DISABLED === '1';
  app.addHook('onReady', async () => {
    await ingest.start();
    // CREW-201: also attach the chokidar watcher for the CLI's startup-
    // event JSONL stream. Defaults to ~/.crew/startup (the path the CLI
    // writes to); docker-compose mounts ${HOME}/.crew/startup into the
    // container at /root/.crew/startup, so os.homedir() == /root inside
    // the daemon resolves to the same place.
    const startupDir = process.env.CREW_STARTUP_EVENTS_DIR ?? join(homedir(), '.crew', 'startup');
    try {
      await ingest.watchStartupEvents(startupDir);
    } catch (err) {
      logger.warn({ err, startupDir }, 'startup-event watcher failed to attach');
    }
    // CREW-202: start the background PR-status poller. Each round walks
    // pr_open agents and asks `gh pr view` for the current PR state.
    if (!prPollerDisabled) prPoller.start();
  });
  app.addHook('onClose', async () => {
    if (!prPollerDisabled) prPoller.stop();
    await ingest.stop();
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof NotFoundError) {
      return reply.code(404).send({ error: err.message, resource: err.resource, id: err.id });
    }
    if (err instanceof ConflictError) {
      return reply.code(409).send({ error: err.code, ...err.details });
    }
    if (err instanceof ConfigDirNotFoundError) {
      return reply.code(503).send({ error: err.message, configDir: err.configDir });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'invalid_input', details: err.issues });
    }
    if (err instanceof Error) {
      const validation = getValidation(err);
      if (validation) {
        return reply.code(400).send({ error: 'invalid_input', details: validation });
      }
      req.log.error({ err }, 'unhandled error');
    } else {
      req.log.error({ err }, 'unhandled non-Error throw');
    }
    return reply.code(500).send({ error: 'internal_error' });
  });

  app.get('/health', async () => ({ ok: true }));

  await registerProjectsRoutes(app);
  await registerAgentsRoutes(app);
  await registerRunsRoutes(app);
  await registerEventsRoutes(app);
  await registerMetricsRoutes(app);
  await registerActionsRoutes(app);

  if (dashboardDistDir && existsSync(join(dashboardDistDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: dashboardDistDir, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.code(200).type('text/html').send(PLACEHOLDER_HTML);
    });
  }

  return app;
}
