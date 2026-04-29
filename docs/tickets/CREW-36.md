# CREW-36 — ProjectsService + GET /api/projects

Jira: https://safturento.atlassian.net/browse/CREW-36

## Goal

Add the daemon's first business endpoint: `GET /api/projects`. A
`ProjectsService` reads `~/.config/crew/projects/*.toml`, returns
`{ projects: Array<{ name, repoPath }> }` matching the dashboard's
`Project` type, and the route resolves the service from the Awilix
scope. Invalid TOMLs are warn-logged and skipped — one bad file must
not break the whole list.

## Relevant files

- `packages/daemon/src/services/ProjectsService.ts` — class with
  `list(): ProjectSummary[]`. Uses `parseProjectConfig` from
  `crew-shared` to validate each `.toml`, sorts by name, skips
  invalid files via `logger.warn`.
- `packages/daemon/src/services/ProjectsService.test.ts` —
  tmpdir-based tests: alphabetization, invalid-TOML skip + warn,
  missing dir, non-`.toml` ignored.
- `packages/daemon/src/routes/projects.ts` — registers
  `GET /api/projects` with a Zod response schema; resolves
  `projectsService` from `req.diScope`.
- `packages/daemon/src/routes/projects.test.ts` — Fastify
  `app.inject` tests: empty list, single project, multi-project
  alphabetization.
- `packages/daemon/src/container.ts` — adds `projectsService` to
  `DaemonCradle` and registers it as
  `asFunction(...).scoped()` per the canonical layering.
- `packages/daemon/src/app.ts` — wires
  `fastify-type-provider-zod` (`withTypeProvider<ZodTypeProvider>()`,
  validator + serializer compilers) so the route's Zod schema is
  honored at serialization, and calls `registerProjectsRoutes(app)`.
- `packages/daemon/src/test/tmpdir.ts` — `useTmpDir()` helper
  (returns a `tmp()` factory; `afterEach` cleans up).
- `packages/daemon/package.json` — adds `fastify-type-provider-zod`.

## Decisions

- **Adopt `fastify-type-provider-zod` here, not in CREW-35.** The
  plan's tech stack lists it but CREW-35 shipped without it. Adding
  it as part of this ticket is the smallest patch path: `setValidator`
  / `setSerializer` compilers are no-ops for routes that don't use a
  Zod schema, so existing `/health` and error tests are unaffected.
- **`projectsDir` parameter, not `configDir`, on `ProjectsService`.**
  Awilix builds the service with `projectsDir: config.configDir` —
  the cradle name happens to match because today the daemon's
  `configDir` IS the projects directory. The service is named for
  what it actually scans.
- **`silentLogger` via `pino({ level: 'silent' })` directly in
  tests.** `createLogger()` doesn't take a level option; using `pino`
  directly avoids extending its API just for test silencing.
- **Deviated from the plan's route-test setup.** The plan wrote
  `parseDaemonConfig({ CREW_CONFIG_DIR: dir })` and
  `mkdirSync(join(dir, 'projects'))`, but CREW-35's config schema
  treats `CREW_CONFIG_DIR` as the projects dir directly. Test now
  passes `CREW_CONFIG_DIR: join(root, 'projects')` and writes the
  TOMLs into that exact directory.
- **Plan's `buildApp({ container })` signature kept as
  `buildApp({ config, logger, db })`.** That's what CREW-35 shipped
  and what the existing `app.test.ts` already exercises; rewriting
  it would be churn for no functional gain.
- **Three route tests, not two.** The acceptance criteria called
  out empty / single / alphabetized; the plan's snippet only
  covered empty + single. Added the alphabetization case to match
  AC.

## Verification

- `npm run test:run --workspace=crew-daemon` — 20/20 pass (was
  13/13 after CREW-35; adds 4 service + 3 route = 7 new).
- `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npm run test:run` at repo root — all green.
- Manual smoke: with a valid TOML in
  `$CREW_CONFIG_DIR/demo.toml`, `curl /api/projects` returns
  `{"projects":[{"name":"demo","repoPath":"/code/demo"}]}`.

## Out of scope

- `GET /api/projects/:name` (single project detail) — slice 1c.
- Project CRUD endpoints (`POST`, `PATCH`, `DELETE`) — slice 1c.
- Any `/api/agents` endpoints — slice 1b.
