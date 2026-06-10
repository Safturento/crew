# CREW-236 — Fold startupEventsDir into DaemonConfig (single source of truth)

Jira: https://safturento.atlassian.net/browse/CREW-236

## Goal

Route the daemon's startup-event directory through `parseDaemonConfig` like
`CREW_CONFIG_DIR` and `CREW_DB_FILE` already are, so `DaemonConfig` is the
single source of truth and tests override it the same way they override the
config/db paths.

## Relevant files

- `packages/daemon/src/config.ts` — added `CREW_STARTUP_EVENTS_DIR` to the zod
  schema and `startupEventsDir` to `DaemonConfig`.
- `packages/daemon/src/app.ts` — onReady hook now reads `config.startupEventsDir`
  instead of `process.env` directly; dropped the now-unused `homedir` import.
- `packages/daemon/src/config.test.ts` — default + override coverage for the new field.
- `packages/daemon/src/routes/events.test.ts` — dropped the manual `process.env`
  dance; overrides via `parseDaemonConfig({ CREW_STARTUP_EVENTS_DIR: ... })`.
- `packages/daemon/src/test/setup.ts` — kept as the blanket watcher safety net.
- `packages/daemon/src/app.test.ts` — hand-built config literal gained
  `startupEventsDir` (required field).
- `docs/followups.md` — moved the originating followup to Resolved.

## Decisions

- **The schema default consults `process.env`** (`process.env.CREW_STARTUP_EVENTS_DIR
?? join(homedir(), '.crew', 'startup')`) rather than being a pure `homedir()`
  expression. This keeps the package-level `src/test/setup.ts` blanket net working
  for the many route tests that build config from a partial env object without
  naming this key — without editing every one of them. It's a faithful move of the
  exact expression that previously lived in `app.ts`, now contained in the config
  layer (the correct layer) instead of leaking into `app.ts`.

## Ruled out

- **Pure homedir default + thread the dir through every route test's `setupApp`** —
  fully removes the `process.env` read from the default, but touches 7+ test files
  outside the ticket's scope and removes the blanket safety net the ticket asked to
  keep. Not worth the churn/risk for this task.

## Notes

Backend-only; no UI surface. Verified via the full daemon vitest suite (320 tests
green, no watcher warnings), daemon typecheck, lint, and `npm run bruno:smoke`.
