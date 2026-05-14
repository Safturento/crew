# Daemon bootstrap & `/api/projects` — design

> **Purpose of this document.** A scoped design spec for the first end-to-end slice of crew's daemon: stand up a Fastify HTTP server, expose `GET /api/projects` reading from `~/.config/crew/projects/*.toml`, and wire the dashboard's project sections to that endpoint (replacing the mock client for projects only). Agent state, transcript ingestion, and SSE remain on the mock client and are explicitly deferred to slice 1b.
>
> Read [`docs/plans/architecture.md`](../../plans/architecture.md) for system context. This spec **supersedes** the architecture doc's Phase 2 stack picks for the daemon (Hono → Fastify, raw `better-sqlite3` → Kysely + `kysely-better-sqlite3`); §1 below carries the rationale and the architecture doc is updated as part of implementation.

## 1. Stack & rationale

The architecture doc was authored before `~/.claude/skills/reaching-for-backend-patterns` existed. That skill prescribes a canonical Node-backend layering (Fastify + Zod + Kysely + typed errors + Awilix DI) that we want this codebase to align with — even though the daemon is small — so future contributors and agents find the same shape they find in any other backend the skill applies to.

The skill's "alt-stack carve-out" exempts projects with an established stack to preserve. The daemon is greenfield (`packages/daemon/` is empty bar a placeholder `package.json` and `README.md`), so there is no established stack to preserve here — the architecture doc's calls were planning artifacts, not committed code. Aligning now is cheaper than aligning later.

| Concern           | Pick                                                                             | Notes                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP framework    | **Fastify** + `fastify-type-provider-zod`                                        | Skill default; `fastify-type-provider-zod` gives end-to-end Zod inference on routes                                                                                                                                                        |
| Schema validation | **Zod**                                                                          | Already used elsewhere in the repo (CLI's TOML parsing); same library on the wire                                                                                                                                                          |
| Persistence       | **SQLite** at `~/.config/crew/state.db` via **Kysely** + `kysely-better-sqlite3` | SQLite kept for the personal-tool fit (no extra container, single file, trivially backed up); Kysely added to align with the skill's typed-query-builder pattern. Postgres remains a future option if multi-process access is ever needed. |
| Migrations        | Kysely's migration runner                                                        | No migrations created in this slice; runner is wired so 1b's first migration is one file                                                                                                                                                   |
| DI                | **`@fastify/awilix`**                                                            | Plumbing installed in this slice; only the config loader is registered. Real services (transcript parser, state aggregator) start in 1b — that's where Awilix earns its keep.                                                              |
| Logging           | **pino**                                                                         | File at `~/.config/crew/daemon.log`; pretty-printed in foreground mode                                                                                                                                                                     |
| Config / env      | **Zod schema parsed once at boot**                                               | One typed `config` object; no scattered `process.env.X` reads                                                                                                                                                                              |
| Testing           | **Vitest** + Fastify `app.inject()`                                              | tmpdir-based fixtures for project TOMLs; no mocks of the loader                                                                                                                                                                            |

## 2. Scope

In scope for slice 1a:

- Fastify server bootstrap: route registration, error handler, Awilix container wiring, pino logging, Zod-validated env config.
- Daemon lifecycle commands: `crew daemon serve|start|stop|status` (replacing the Phase 1 stubs).
- `GET /api/projects` reading project TOMLs and returning them in the dashboard's `Project` shape.
- `packages/shared/` extraction of `cli/src/lib/config/` (Phase 1.5 trigger — first non-CLI consumer).
- Kysely scaffolding (DB connection, migration-runner wiring, empty migrations directory) — no tables created yet.
- Dashboard `HttpProjectsClient` (real `listProjects()` against the daemon) and `HybridDaemonClient` composing it with the existing `MockDaemonClient` for `listAgents()` (explicitly temporary).
- Vite dev proxy for `/api/*` → `localhost:7773`.
- Production posture: daemon serves the built dashboard at `localhost:7773/` via `@fastify/static` with SPA fallback, so same-origin `/api/projects` works without proxy or CORS.
- Architecture-doc update (`docs/plans/architecture.md`) calling out the Hono → Fastify and raw-SQLite → Kysely-on-SQLite swap, with a pointer to this spec.

Explicitly out of scope (deferred to 1b):

- SQLite tables, DDL, or migrations beyond Kysely's runner scaffolding.
- chokidar watcher for `~/.claude/projects/*/`.
- Transcript parser (`transcripts/`) extraction to `shared/`.
- `POST /api/agents` (CLI registration of new runs).
- `crew run`'s wiring to call the daemon at start.
- `GET /api/agents` returning real data — slice 1a's dashboard agents come from the mock client.
- SSE / live updates.
- Any service beyond `ProjectsService`.
- Jira / GitHub clients in the daemon.

## 3. Daemon process & lifecycle

`crew daemon serve` is the single entry point that loads config, opens the SQLite handle, runs migrations, builds the Fastify app, and listens. Backgrounding is handled by `crew daemon start`, which spawns `crew daemon serve` detached.

| Command              | Behaviour                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crew daemon serve`  | Foreground. Loads config, opens DB, runs migrations, listens on `localhost:CREW_PORT` (default `7773`), logs to stdout (pino-pretty). Exits on SIGTERM/SIGINT.                                                                                                             |
| `crew daemon start`  | `child_process.spawn(crewBin, ['daemon', 'serve'], { detached: true, stdio: ['ignore', logFd, logFd] })`, parent unrefs the child and exits. Writes the child PID to `~/.config/crew/daemon.pid`. Logs go to `~/.config/crew/daemon.log` (pino JSON, one line per record). |
| `crew daemon stop`   | Reads PID file, sends `SIGTERM`, waits up to 5s for exit (`kill 0` polling), removes PID file. Reports `stopped` / `not running` / `failed to stop`.                                                                                                                       |
| `crew daemon status` | Reads PID file. If absent → `stopped`. If present, sends `kill 0`; on success reports `running (pid N, port P)`, on `ESRCH` reports `stale pidfile (pid N)` and unlinks it.                                                                                                |

PID file location, log file location, port, and config directory are all read from the boot-time Zod schema (env vars: `CREW_CONFIG_DIR`, `CREW_PORT`, `CREW_LOG_FILE`, `CREW_PID_FILE` — each with sensible defaults under `~/.config/crew/`).

## 4. `GET /api/projects`

### Layering

Per the skill: route → service → loader. The route is thin; the service holds the logic; the loader is shared with the CLI.

```
src/routes/projects.ts          # Fastify route, ~20 lines
src/services/ProjectsService.ts # one method: list(): Promise<Project[]>
crew-shared/config/             # extracted from cli/src/lib/config/, parses TOML via smol-toml + zod
```

### Request / response

`GET /api/projects` — no params, no body. Returns:

```ts
type ProjectsResponse = {
  projects: Array<{
    name: string;
    repoPath: string;
  }>;
};
```

Response schema is declared in Zod and shared with the dashboard via `crew-shared` so both ends use the same source of truth. Validation enforced via `fastify-type-provider-zod`'s response schema option.

### Service behaviour

`ProjectsService.list()`:

1. Read `CREW_CONFIG_DIR/projects/*.toml` (using `node:fs.readdir`, filter by extension).
2. For each file, parse via the shared config schema. A parse failure on any single file is logged at `warn` level and skipped (one bad TOML must not break the dashboard's project list).
3. Map each parsed config to the dashboard's `Project` shape — currently `{ name, repoPath }`. Other fields in the TOML (jira, github, docker, sandbox blocks) are not exposed by this endpoint; they'll be returned by `GET /api/projects/:name` in a future slice.
4. Return the list in alphabetical order by `name` (deterministic for snapshot tests).

### Errors

Typed errors thrown from the service and converted by Fastify's `setErrorHandler`:

- `ConfigDirNotFoundError` → 500 with `{ error: 'config_dir_missing', path }`. (User has never run any `crew` command — should be rare.)
- Generic unhandled → 500 with `{ error: 'internal_error' }`, full error logged via pino.

A bad single TOML is **not** an error response — it's a `warn` log and the file is skipped, as above.

## 5. Dashboard wiring

### `HttpProjectsClient`

`packages/dashboard/src/data/HttpProjectsClient.ts` — implements only `listProjects()` of the `DaemonClient` interface. Fetches `/api/projects`, validates the response with the shared Zod schema, returns the `projects` array.

Tested with a `fetch` stub (Vitest's `vi.spyOn(global, 'fetch')`).

### `HybridDaemonClient`

`packages/dashboard/src/data/HybridDaemonClient.ts` — composes `HttpProjectsClient` (for `listProjects`) and `MockDaemonClient` (for `listAgents`). One file, ~20 lines, **explicitly temporary**: a `// TODO(1b): replace with HttpDaemonClient` comment marks it for deletion in slice 1b.

`App.tsx`'s `defaultClient` switches from `new MockDaemonClient()` to `new HybridDaemonClient(new HttpProjectsClient(), new MockDaemonClient())`.

### Vite proxy

`packages/dashboard/vite.config.ts` adds:

```ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:7773', changeOrigin: false },
  },
},
```

In dev (`vite` on `:5173`), `fetch('/api/projects')` is proxied to the daemon. In production (daemon serves `dashboard/dist/` at `:7773`), the same fetch is same-origin. No CORS surface either way.

## 6. Production static serve

The daemon registers `@fastify/static` pointed at `packages/dashboard/dist/`:

- Static assets served at `/*`.
- SPA fallback: requests for `/`, `/projects`, `/agents/:key`, etc. that don't match a file return `dashboard/dist/index.html`.
- API routes (`/api/*`) are mounted before the static handler so they take precedence.

If the build directory is missing at boot, the daemon logs a `warn` and serves a tiny placeholder at `/` ("dashboard not built — run `npm run build --workspace=crew-dashboard`"). API routes still work; dev workflow (Vite proxy) is unaffected.

## 7. Tests

| Surface                             | Test                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectsService`                   | Vitest. `fs.mkdtempSync`, write fixture TOMLs, instantiate service pointed at the tmpdir, assert the returned projects. Cover: happy path, empty dir, mixed valid/invalid TOMLs (verify warn log + valid ones still returned), absent dir.                                             |
| `GET /api/projects` route           | Vitest + `app.inject({ method: 'GET', url: '/api/projects' })`. Asserts status, response shape, and Zod validation on the response.                                                                                                                                                    |
| Lifecycle (`start`/`stop`/`status`) | Smoke test gated behind `CREW_RUN_INTEGRATION=1` (`describe.skipIf(!process.env.CREW_RUN_INTEGRATION)`) so default `vitest run` stays fast. Spawns the CLI, waits for PID file, asserts `status` reports `running`, `stop` cleans up. Run locally before merge; not yet wired into CI. |
| `HttpProjectsClient`                | Vitest with `fetch` stubbed. Asserts request URL, response parsing, and Zod validation failure mode (malformed response throws).                                                                                                                                                       |
| `HybridDaemonClient`                | Vitest. Constructs with stubbed `HttpProjectsClient` and `MockDaemonClient`, asserts each method delegates to the right one.                                                                                                                                                           |
| `App` integration                   | Existing `App.test.tsx` updated: render with a hybrid client whose `HttpProjectsClient` uses fetch-stubbed projects + the real `MockDaemonClient` for agents. Assert both project sections and mock agents render.                                                                     |

## 8. Open questions / decisions deferred

- **Awilix scope mode in 1a.** Plumbing is wired but only the config loader is registered. The skill recommends `asClass(...).scoped()` (request-scoped) for services. We'll register `ProjectsService` as `scoped` from the start, even though there's nothing else in the container yet, to set the precedent.
- **`crew-shared` package name.** Workspace name confirmed as `crew-shared` (matches the existing `crew-cli`, `crew-daemon`, `crew-dashboard` convention).
- **Build orchestration for production serve.** This slice doesn't add a top-level `build` script; running `npm run build --workspace=crew-dashboard` before `crew daemon start` is sufficient. A unified build script can come later.

## 9. Hand-off to writing-plans

The implementation plan should:

1. Sequence the `shared/` extraction first (everything else depends on it).
2. Bootstrap the daemon (Fastify + Awilix + pino + Kysely scaffolding + Zod env) as a coherent ticket — the pieces are mutually entangled enough that splitting them creates more friction than it saves.
3. Add `ProjectsService` + `GET /api/projects` + tests as one ticket.
4. Add `crew daemon serve|start|stop|status` lifecycle as one ticket — `serve` is what the previous ticket already left running; this adds the daemonization wrapper.
5. Wire the dashboard (`HttpProjectsClient` + `HybridDaemonClient` + `App.tsx` switch + Vite proxy + `App.test.tsx` update) as one ticket.
6. Production static serve (`@fastify/static` + SPA fallback + missing-build placeholder) as one ticket.
7. Architecture-doc update (Hono → Fastify, raw-SQLite → Kysely-on-SQLite, pointer to this spec) as one ticket — small, low-risk, parallelisable.

The `shared/` extraction blocks everything; the daemon bootstrap blocks the projects endpoint and the lifecycle commands; the projects endpoint blocks the dashboard wiring. The architecture-doc update is independent and can run in parallel with anything.
