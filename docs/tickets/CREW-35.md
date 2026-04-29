# CREW-35 — Daemon bootstrap: Fastify + Awilix + pino + Zod env + Kysely scaffolding

Jira: https://safturento.atlassian.net/browse/CREW-35

## Goal

Stand up `packages/daemon/` as a runnable Fastify HTTP server using the
canonical layering from `reaching-for-backend-patterns`: Awilix DI,
pino logging, a Zod-validated env config, Kysely + better-sqlite3
scaffolding (no tables yet), and typed errors mapped centrally by
`setErrorHandler`. Ships a single `GET /health` route to prove the
wiring; business routes (`/api/projects`) come in the next ticket.

## Relevant files

- `packages/daemon/package.json` — declares deps, `dev`/`start`/
  `typecheck`/`test`/`test:run` scripts, and a `crew-daemon` bin
  shim.
- `packages/daemon/tsconfig.json` — extends the workspace base, adds
  `node` types.
- `packages/daemon/bin/crew-daemon` — bash shim that resolves `tsx`
  from the workspace root, mirroring `packages/cli/bin/crew`.
- `packages/daemon/src/config.ts` — `parseDaemonConfig(env)` reads
  `CREW_PORT`, `CREW_CONFIG_DIR`, `CREW_DB_FILE`, `CREW_PID_FILE`,
  `CREW_LOG_FILE` via Zod with defaults under `~/.config/crew/`.
- `packages/daemon/src/logger.ts` — `createLogger()` returns a pino
  instance (pino-pretty when stdout is a TTY).
- `packages/daemon/src/errors.ts` — `NotFoundError` and
  `ConfigDirNotFoundError` typed errors thrown from services.
- `packages/daemon/src/db.ts` — `createDb(file)` (Kysely +
  `SqliteDialect` driving `better-sqlite3`) and `runMigrations(db,
path)` (Kysely's `Migrator` + `FileMigrationProvider`).
- `packages/daemon/src/migrations/.gitkeep` — empty migrations folder
  so `runMigrations` has somewhere to point.
- `packages/daemon/src/container.ts` — Awilix cradle declaration
  (`config`, `logger`, `db`) plus a `registerServices` helper. Uses
  module augmentation on `@fastify/awilix`'s `Cradle` for typed
  resolution at the route level.
- `packages/daemon/src/app.ts` — `buildApp({ config, logger, db })`
  registers the Awilix plugin, wires `setErrorHandler` (mapping
  `NotFoundError` → 404, `ConfigDirNotFoundError` → 503, `ZodError` /
  Fastify validation → 400, fallthrough → 500), and registers
  `GET /health → { ok: true }`.
- `packages/daemon/src/serve.ts` — boot sequence: parse config,
  ensure the state.db parent dir exists, open DB, run migrations,
  build app, listen on `127.0.0.1:<port>`.
- `packages/daemon/src/index.ts` — entry point invoked by the bin
  shim; wires SIGINT/SIGTERM to `app.close()`.

## Decisions

- **Kysely's built-in `SqliteDialect` over a `kysely-better-sqlite3`
  shim.** The original ticket text named `kysely-better-sqlite3`, but
  no such package is published — Kysely's own `SqliteDialect`
  consumes a `better-sqlite3` `Database` directly, which is the
  canonical pairing.
- **`DaemonDatabase` is `Record<string, never>` for now.** The
  type-cradle is empty in slice 1a; tables added in slice 1b will
  populate it alongside their migrations.
- **Awilix cradle declares `config`, `logger`, `db` only.** Routes
  for `/api/projects` will add `projectsService` (and
  `projectConfigDir` derived from `config.configDir`) when that
  ticket lands.
- **`CREW_PORT` non-numeric throws.** `z.coerce.number().int().positive()`
  on the schema means `CREW_PORT=notaport` blows up at boot rather
  than silently falling through to the default.
- **Server binds to `127.0.0.1`, not `0.0.0.0`.** Per
  `docs/plans/architecture.md`: the daemon is localhost-only.
- **Per-test fresh `buildApp` instances in `app.test.ts`.** Fastify
  closes route registration after the first `inject`/`ready`, so the
  tests that register sentinel error-throwing routes build a fresh
  app rather than adding a test-only seam to `buildApp`.

## Verification

- `npm run lint` — pass at workspace root.
- `npm run typecheck` — pass for all four workspaces.
- `npm run test:run --workspace=crew-daemon` — 13/13 pass (config,
  db, app).
- `npm run test:run` — 117/117 pass across all workspaces.
- `CREW_PORT=17773 ... npm run dev --workspace=crew-daemon` then
  `curl http://localhost:17773/health` → `{"ok":true}` (status 200);
  `/api/missing` → 404.
- `npm run format:check` — only pre-existing format warnings remain
  (none in files this ticket touches).
