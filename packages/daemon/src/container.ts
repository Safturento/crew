import { asValue, asFunction, createContainer, type AwilixContainer } from 'awilix';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { DaemonConfig } from './config.js';
import type { DaemonDatabase } from './db.js';
import { ProjectsService } from './services/ProjectsService.js';
import { AgentsService } from './services/AgentsService.js';

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
  projectsService: ProjectsService;
  agentsService: AgentsService;
}

declare module '@fastify/awilix' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Cradle extends DaemonCradle {}
}

export interface BuildContainerDeps {
  config: DaemonConfig;
  logger: Logger;
  db: Kysely<DaemonDatabase>;
}

/**
 * Build a fresh Awilix container scoped to a single `buildApp` call. We
 * deliberately do not reuse `@fastify/awilix`'s shared `diContainer`
 * singleton — tests build multiple apps in one process, and a shared
 * container would let the second registration silently overwrite the
 * first.
 */
export function buildContainer(deps: BuildContainerDeps): AwilixContainer<DaemonCradle> {
  const container = createContainer<DaemonCradle>();
  container.register({
    config: asValue(deps.config),
    logger: asValue(deps.logger),
    db: asValue(deps.db),
    // `config.configDir` IS the projects directory today (per CREW-35's
    // env schema). The service param is named `projectsDir` to describe
    // what it actually scans; if `DaemonConfig` later splits the two,
    // change this argument, not the service's parameter name.
    projectsService: asFunction(
      ({ config, logger }: DaemonCradle) =>
        new ProjectsService({ projectsDir: config.configDir, logger }),
    ).scoped(),
    agentsService: asFunction(({ db }: DaemonCradle) => new AgentsService({ db })).scoped(),
  });
  return container;
}
