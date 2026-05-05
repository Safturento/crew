# CREW-55 — Run-lifecycle endpoints + IngestService wiring

Jira: https://safturento.atlassian.net/browse/CREW-55

## Goal

Land the two run-lifecycle endpoints (`POST /api/agents/runs` + `POST
.../runs/:runId/complete`) and wire `IngestService` into the Awilix container
with start/stop lifecycle hooks. Task 5 of
`docs/superpowers/plans/2026-04-29-agents-data-end-to-end.md` — Tasks 1–4 had
already shipped on this branch; this PR is Task 5 only.

## Relevant files

- `packages/daemon/src/container.ts` — MOD; register `ingestService` as a
  process-singleton (other services are scoped per-request).
- `packages/daemon/src/app.ts` — MOD; extract the container to a local so
  `onReady`/`onClose` hooks can call `ingest.start()` / `.stop()`. Map the
  new `ConflictError` to 409 in `setErrorHandler`.
- `packages/daemon/src/errors.ts` — MOD; new `ConflictError` typed error with
  `code` + `details` fields.
- `packages/daemon/src/routes/runs.ts` — NEW; the two endpoints.
- `packages/daemon/src/routes/runs.test.ts` — NEW; the seven cases from the
  plan.
- `packages/daemon/src/{app,routes/projects}.test.ts` — MOD; run migrations
  before `buildApp` (the new `IngestService.start` hook queries `runs` at
  boot, so an unmigrated DB now fails the startup probe).
- `bruno/endpoints/agents/post-{register,complete}-run.bru` — NEW; reference
  cards for the two endpoints.

## Decisions

- **Throw typed errors instead of `reply.code(409).send(...)`** — the plan's
  snippet uses inline `reply.code(...)` for the 409 paths, but
  `fastify-type-provider-zod` types `reply.send` strictly to the declared
  201 response schema, so inline `reply.code(409)` doesn't typecheck. Added
  a `ConflictError` typed error and a `setErrorHandler` branch for it,
  matching the pattern already established by `NotFoundError`. The
  `error: <code>` shape the test asserts is preserved verbatim.
- **Run migrations in `app.test.ts` and `projects.test.ts`** — the new
  `onReady` hook always runs `IngestService.start`, which selects from the
  `runs` table. Tests that previously built apps on a fresh in-memory DB
  without migrations had to migrate first. Aligns with the pattern that
  `agents.test.ts` and the new `runs.test.ts` already use.
- **`IngestService` as `singleton()`** — one ingest service owns the
  lifecycle of all per-run tails for a daemon process. Resolved via
  `container.cradle.ingestService` (not request-scoped) so the `onReady` /
  `onClose` hooks share state with the route handlers' `req.diScope.resolve`.
- **`useTmpDir` for the runs test fixture** — the plan's test code uses an
  inline `tmpdirs[]` + `afterEach`. Switched to the shared `useTmpDir`
  helper for consistency with `agents.test.ts` / the project convention.
- **`delete bad.sessionId` over `_omit` destructure** — the project's
  eslint config doesn't carve out `^_` as an unused-var ignore, so
  `const { sessionId: _omit, ...bad } = ...` lints red. Mutating a
  `Partial<typeof validBody>` keeps it clean.

## Notes

Bruno endpoints were added but the smoke flow (`flows/main-smoke.bru`) was
not extended to chain them — it currently just exercises `/api/projects`
and the new `.bru` files are reference cards for `endpoints/agents/`. A
register-then-complete chain in the smoke flow would be a natural followup
once a happy-path end-to-end smoke is wanted.
