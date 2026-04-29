import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify';
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
import { ConfigDirNotFoundError, NotFoundError } from './errors.js';
import { buildContainer } from './container.js';
import { registerProjectsRoutes } from './routes/projects.js';

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
}

/**
 * Build a configured Fastify instance with the daemon's DI container,
 * central error handler, and routes registered. The caller starts the
 * server (or calls `app.inject` in tests) and is responsible for
 * `app.close()` on shutdown.
 */
export async function buildApp({ config, logger, db }: BuildAppOptions): Promise<DaemonApp> {
  const app: DaemonApp = Fastify({ loggerInstance: logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifyAwilixPlugin, {
    container: buildContainer({ config, logger, db }),
    disposeOnClose: true,
    disposeOnResponse: false,
    asyncInit: false,
    asyncDispose: false,
    strictBooleanEnforced: true,
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof NotFoundError) {
      return reply.code(404).send({ error: err.message, resource: err.resource, id: err.id });
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

  return app;
}
