import { asValue, createContainer, type AwilixContainer } from 'awilix';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { DaemonConfig } from './config.js';
import type { DaemonDatabase } from './db.js';

/**
 * The daemon's Awilix cradle. Routes resolve services by these names via
 * `request.diScope.resolve('name')`. Declared once here and augmented onto
 * `@fastify/awilix`'s `Cradle` interface so resolution is fully typed at
 * the call site.
 *
 * Note: the `declare module` below is a process-global declaration. Adding
 * keys here permanently augments `Cradle` for every consumer of
 * `@fastify/awilix` in this process — keep this list aligned with the
 * services actually registered by `buildContainer`.
 */
export interface DaemonCradle {
  config: DaemonConfig;
  logger: Logger;
  db: Kysely<DaemonDatabase>;
}

declare module '@fastify/awilix' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Cradle extends DaemonCradle {}
}

/**
 * Build a fresh Awilix container scoped to a single `buildApp` call. We
 * deliberately do not reuse `@fastify/awilix`'s shared `diContainer`
 * singleton — tests build multiple apps in one process, and a shared
 * container would let the second registration silently overwrite the
 * first.
 */
export function buildContainer(services: DaemonCradle): AwilixContainer<DaemonCradle> {
  const container = createContainer<DaemonCradle>();
  container.register({
    config: asValue(services.config),
    logger: asValue(services.logger),
    db: asValue(services.db),
  });
  return container;
}
