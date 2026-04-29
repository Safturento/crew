import Fastify, { type FastifyError } from 'fastify';
import { fastifyAwilixPlugin, diContainer } from '@fastify/awilix';
import { ZodError } from 'zod';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { DaemonConfig } from './config.js';
import type { DaemonDatabase } from './db.js';
import { ConfigDirNotFoundError, NotFoundError } from './errors.js';
import { registerServices } from './container.js';

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
export async function buildApp({ config, logger, db }: BuildAppOptions) {
  const app = Fastify({ loggerInstance: logger });

  await app.register(fastifyAwilixPlugin, {
    disposeOnClose: true,
    disposeOnResponse: false,
    asyncInit: false,
    asyncDispose: false,
    strictBooleanEnforced: true,
  });

  registerServices(diContainer, { config, logger, db });

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

  return app;
}
