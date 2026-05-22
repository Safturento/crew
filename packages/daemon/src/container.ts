import { asValue, asFunction, createContainer, type AwilixContainer } from 'awilix';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { DaemonConfig } from './config.js';
import type { DaemonDatabase } from './db.js';
import { ProjectsService } from './services/ProjectsService.js';
import { AgentsService } from './services/AgentsService.js';
import { IngestService } from './services/IngestService.js';
import { EventBus } from './services/EventBus.js';
import { TimelineService } from './services/TimelineService.js';
import { MetricsService } from './services/MetricsService.js';
import { resolveJsonlPathForAgent } from './services/resolveJsonlPath.js';

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
  ingestService: IngestService;
  eventBus: EventBus;
  timelineService: TimelineService;
  metricsService: MetricsService;
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
    agentsService: asFunction(
      ({ db, config }: DaemonCradle) =>
        new AgentsService({ db, projectsDir: config.configDir }),
    ).scoped(),
    metricsService: asFunction(
      ({ db, logger }: DaemonCradle) => new MetricsService({ db, logger }),
    ).scoped(),
    projectsService: asFunction(
      ({ config, logger, agentsService }: DaemonCradle) =>
        new ProjectsService({ projectsDir: config.configDir, logger, agentsService }),
    ).scoped(),
    // One event bus per daemon process — its ring buffer + subscriber set
    // must be shared across every request that opens an SSE connection,
    // and across every service that publishes. Singleton, not scoped.
    // Registered before `ingestService` so the cradle resolves the bus at
    // ingest construction time without a forward dependency.
    eventBus: asFunction(() => new EventBus()).singleton(),
    // One ingest service per daemon process — owns the lifecycle of all
    // active per-run transcript tails. Singleton (not scoped) so requests
    // share state with the start/stop hooks in `buildApp`.
    ingestService: asFunction(
      ({ db, logger, eventBus }: DaemonCradle) => new IngestService({ db, logger, eventBus }),
    ).singleton(),
    // Re-parses an agent's JSONL on demand. `resolveJsonlPath` queries
    // the latest run for the key + reuses `claudeProjectDirFor` so the
    // path matches what `IngestService` writes/tails.
    timelineService: asFunction(
      ({ db, logger }: DaemonCradle) =>
        new TimelineService({
          resolveJsonlPath: (agentKey) => resolveJsonlPathForAgent(db, agentKey),
          logger,
        }),
    ).scoped(),
  });
  return container;
}
