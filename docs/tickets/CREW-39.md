# CREW-39 — Daemon serves built dashboard at `/` with SPA fallback

Jira: https://safturento.atlassian.net/browse/CREW-39

## Goal

Register `@fastify/static` in the daemon pointed at `packages/dashboard/dist/`,
with an SPA fallback that returns `index.html` for unknown non-`/api` routes.
Same-origin `/api/projects` then works whether the dashboard is served by Vite
(proxied) or by the daemon (built). When `dist/` is missing at boot, the daemon
serves a tiny "dashboard not built" placeholder so `/api/*` still works.

## Plan reference

Task 6 in `docs/superpowers/plans/2026-04-28-daemon-bootstrap-and-projects-endpoint.md`.

## Relevant files

- `packages/daemon/package.json` — add `@fastify/static` dependency.
- `packages/daemon/src/app.ts` — extend `BuildAppOptions` with optional
  `dashboardDistDir`, register `@fastify/static` when the dir contains
  `index.html`, attach a `setNotFoundHandler` that splits `/api/*` (JSON 404)
  from everything else (SPA fallback or placeholder HTML).
- `packages/daemon/src/app.test.ts` — four new cases covering built dist,
  SPA fallback, missing dist, and `/api/projects` not being intercepted.
- `packages/daemon/src/serve.ts` — resolve `DASHBOARD_DIST` relative to the
  daemon package via `import.meta.url` and pass it to `buildApp`.

## Decisions

- **`existsSync(join(distDir, 'index.html'))` is the gate.** Truthy
  `dashboardDistDir` alone isn't enough — the path the daemon was built
  against may not contain a build yet, so the placeholder branch handles
  both "no path provided" and "path provided but unbuilt" identically.
- **`/api/*` is the marker for the JSON-vs-HTML split.** Same boundary the
  Vite dev proxy uses; nothing else calls into the daemon over HTTP today.
- **Tests build a real dist tree under a tmpdir.** The four-case matrix
  exercises real `@fastify/static` resolution against an actual file —
  mocking `existsSync` would test the conditional, not the integration.
- **`serve.ts` resolves the dist dir, not `app.ts`.** Keeps `buildApp` a
  pure function of its inputs, so tests can point it anywhere without
  relying on `import.meta.url` resolving correctly under tsx.

## Verification

- `npm run lint` — pass.
- `npm run typecheck` — pass for all four workspaces.
- `npm run test:run` — all suites pass, four new daemon cases included.
- `npm run format:check` — no new format warnings in touched files.
- Manual smoke: `npm run build --workspace=crew-dashboard`, start the
  daemon with a tmp `CREW_CONFIG_DIR`, `curl localhost:7773/` returns
  built `index.html`, `curl localhost:7773/api/projects` returns the
  projects payload.
