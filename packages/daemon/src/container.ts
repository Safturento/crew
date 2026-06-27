import { asValue, asFunction, createContainer, type AwilixContainer } from 'awilix';
import { loadGithubWebhookSecrets } from 'crew-shared';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { DaemonConfig } from './config.js';
import type { DaemonDatabase } from './db.js';
import { GithubWebhookService } from './services/GithubWebhookService.js';
import { ProjectsService } from './services/ProjectsService.js';
import { AgentsService } from './services/AgentsService.js';
import { IngestService } from './services/IngestService.js';
import { EventBus } from './services/EventBus.js';
import { TimelineService } from './services/TimelineService.js';
import { MetricsService } from './services/MetricsService.js';
import { Octokit } from '@octokit/rest';
import { PrPoller } from './services/PrPoller.js';
import { PrTransitionService } from './services/PrTransitionService.js';
import { GithubClient } from './services/github/github-client.js';
import { RunnerStatusService } from './services/RunnerStatusService.js';
import { FinishStepsService } from './services/FinishStepsService.js';
import { ActionService } from './services/ActionService.js';
import { RunnerCommandsService } from './services/RunnerCommandsService.js';
import { RunFailureService } from './services/RunFailureService.js';
import { TicketsService } from './services/TicketsService.js';
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
  prTransitionService: PrTransitionService;
  githubClient: GithubClient;
  prPoller: PrPoller;
  runnerStatusService: RunnerStatusService;
  finishStepsService: FinishStepsService;
  actionService: ActionService;
  runnerCommandsService: RunnerCommandsService;
  runFailureService: RunFailureService;
  ticketsService: TicketsService;
  githubWebhookSecrets: Map<string, string>;
  githubWebhookService: GithubWebhookService;
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
      ({ db, config, timelineService, logger }: DaemonCradle) =>
        new AgentsService({ db, projectsDir: config.configDir, timelineService, logger }),
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
      ({ db, logger, config }: DaemonCradle) =>
        new TimelineService({
          resolveJsonlPath: (agentKey) =>
            resolveJsonlPathForAgent(db, agentKey, config.transcriptsHome),
          logger,
          // CREW-201: lets getTimeline merge startup_events rows alongside
          // the transcript so the drawer Timeline shows phase rows.
          db,
        }),
    ).scoped(),
    // CREW-268: shared idempotent pr_open → pr_merged transition, used by the
    // poller (and the webhook fast path, CREW-267 child C). Singleton for
    // parity with the merge-path services it serves; it holds no state.
    prTransitionService: asFunction(
      ({ db, eventBus, logger }: DaemonCradle) => new PrTransitionService({ db, eventBus, logger }),
    ).singleton(),
    // CREW-301: typed GitHub client (Octokit) for PrPoller's PR-state checks,
    // replacing the in-container `gh pr view`. Singleton — one Octokit per
    // process, authenticated by config.githubToken (empty → calls fail and
    // PrPoller logs+no-ops).
    githubClient: asFunction(
      ({ config }: DaemonCradle) => new GithubClient(new Octokit({ auth: config.githubToken })),
    ).singleton(),
    // CREW-202: background + on-demand poller of GitHub PR state. Singleton
    // because `start()` schedules a setInterval the app owns the lifetime
    // of — request-scoped instances would each schedule their own timer.
    // CREW-268: routes the transition through prTransitionService and runs at
    // a 30-min backstop cadence behind the webhook fast path.
    prPoller: asFunction(
      ({ db, logger, prTransitionService, githubClient }: DaemonCradle) =>
        new PrPoller({ db, logger, prTransitions: prTransitionService, github: githubClient }),
    ).singleton(),
    // CREW-215: tracks the host runner's heartbeat → online/offline edges.
    // Singleton because the heartbeat state + falling-edge timer must be
    // shared across every request that posts a heartbeat or reads status.
    runnerStatusService: asFunction(
      ({ eventBus }: DaemonCradle) => new RunnerStatusService({ eventBus }),
    ).singleton(),
    // CREW-215: stateless (db + bus injected), so request-scoped like the
    // other query services.
    finishStepsService: asFunction(
      ({ db, eventBus }: DaemonCradle) => new FinishStepsService({ db, eventBus }),
    ).scoped(),
    // CREW-214: queued dashboard actions. Scoped — it carries no state of
    // its own (the queue lives in SQLite + the singleton event bus), so a
    // per-request instance is fine and matches the other DB-backed services.
    actionService: asFunction(
      ({ db, eventBus }: DaemonCradle) => new ActionService({ db, eventBus }),
    ).scoped(),
    // CREW-241: reverse-command queue drained by the host runner. Scoped —
    // like actionService, it carries no state of its own (the queue lives in
    // SQLite + the singleton event bus), so a per-request instance is fine.
    runnerCommandsService: asFunction(
      ({ db, eventBus }: DaemonCradle) => new RunnerCommandsService({ db, eventBus }),
    ).scoped(),
    // CREW-244: register-before-preflight + failed-start capture. Scoped —
    // stateless over SQLite + the singleton event bus (the periodic reaper is
    // driven by the app lifecycle, not held here).
    runFailureService: asFunction(
      ({ db, eventBus }: DaemonCradle) => new RunFailureService({ db, eventBus }),
    ).scoped(),
    // CREW-278: New Run ticket picker — fetches a project's Ready-for-Development
    // tickets from Jira, grouped + runnability-classified. Scoped — stateless
    // over the injected creds + agentsService.
    ticketsService: asFunction(
      ({ config, agentsService, logger }: DaemonCradle) =>
        new TicketsService({
          jiraEmail: config.jiraEmail,
          jiraToken: config.jiraToken,
          agentsService,
          logger,
        }),
    ).scoped(),
    // CREW-270: per-repo HMAC secrets for the GitHub webhook receiver. Loaded
    // once at container build from the read-only secrets-file mount (CREW-269);
    // a change requires a daemon restart, same lifecycle as the project TOMLs.
    githubWebhookSecrets: asFunction(({ config }: DaemonCradle) =>
      loadGithubWebhookSecrets(config.githubWebhookSecretsFile),
    ).singleton(),
    // CREW-270: verifies + dispatches GitHub pull_request webhook deliveries
    // for PR-merge detection. Scoped — stateless over the injected projects
    // service, secrets map, and the shared prTransitionService.
    githubWebhookService: asFunction(
      ({ projectsService, githubWebhookSecrets, prTransitionService, logger }: DaemonCradle) =>
        new GithubWebhookService({
          projectsService,
          secrets: githubWebhookSecrets,
          prTransitions: prTransitionService,
          logger,
        }),
    ).scoped(),
  });
  return container;
}
