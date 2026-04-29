import { asValue, type AwilixContainer } from 'awilix';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { DaemonConfig } from './config.js';
import type { DaemonDatabase } from './db.js';

/**
 * The daemon's Awilix cradle. Routes resolve services by these names via
 * `request.diScope.resolve('name')`. Declared once here and augmented onto
 * `@fastify/awilix`'s `Cradle` interface so resolution is fully typed at
 * the call site.
 */
export interface DaemonCradle {
  config: DaemonConfig;
  logger: Logger;
  db: Kysely<DaemonDatabase>;
}

declare module '@fastify/awilix' {
  // Module augmentation — keep in sync with DaemonCradle.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Cradle extends DaemonCradle {}
}

/**
 * Register the daemon's singleton services on a fresh container or the
 * `@fastify/awilix` shared `diContainer`. Called from `buildApp` after the
 * Awilix plugin has been registered.
 */
export function registerServices(
  container: AwilixContainer<DaemonCradle>,
  services: DaemonCradle,
): void {
  container.register({
    config: asValue(services.config),
    logger: asValue(services.logger),
    db: asValue(services.db),
  });
}
