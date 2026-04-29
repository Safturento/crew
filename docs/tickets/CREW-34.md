# CREW-34 — Extract project-config loader from cli to crew-shared

Jira: https://safturento.atlassian.net/browse/CREW-34

## Goal

Move the project-config schema + TOML loader out of `packages/cli/src/lib/config/`
and into `packages/shared/src/config/` so the soon-to-land daemon can import the
same parser/schema by name. The git-aware `discoverProjectConfig` (which shells
out via `execa`) stays CLI-local. CLI consumers' import paths converge on
`crew-shared` via the existing `cli/src/lib/index.ts` re-export barrel.

## Relevant files

- `packages/shared/package.json` — populates the placeholder workspace package
  with `exports`, `scripts`, and the `smol-toml` + `zod` deps.
- `packages/shared/tsconfig.json` — Node target mirroring the CLI's tsconfig.
- `packages/shared/src/config/{schema,loader,index}.ts` — moved from CLI;
  `loadProjectConfigByName` gains an optional `configDir` parameter so the
  daemon (and tests) can target a non-`~/.config/crew/projects` directory
  without monkey-patching `homedir()`.
- `packages/shared/src/config/loader.test.ts` + `test/fixtures/project-config-sample.toml`
  — moved from the CLI; covers the same `parseProjectConfig` cases plus a new
  case for `loadProjectConfigByName` honouring `configDir`.
- `packages/cli/src/lib/discover-project-config.ts` — new home for the
  git-aware auto-discovery (uses `execa`); imports types from `crew-shared`.
- `packages/cli/src/lib/index.ts` — re-exports `crew-shared` plus the new
  CLI-local `discoverProjectConfig` so existing `../lib/index.js` import sites
  keep working.
- `packages/cli/package.json` — adds `crew-shared` as a workspace dependency.
- `packages/cli/src/commands/run.ts` — updated to import from `../lib/index.js`
  instead of the now-deleted `../lib/config/index.js`.
- `packages/cli/src/lib/config/` and `packages/cli/test/fixtures/project-config-sample.toml`
  — deleted; nothing else references them.

## Decisions

- **`configDir` is an optional parameter, not a constructor.** The daemon
  injects the config directory via DI later; for now an explicit parameter on
  `loadProjectConfigByName` keeps the call site honest without forcing every
  CLI command to thread state.
- **`discoverProjectConfig` stays CLI-local.** It calls `execa('git', ...)`,
  which is squarely a CLI concern; the daemon will receive `(name)` from the
  CLI, not auto-discover from a worktree.
- **CLI keeps `cli/src/lib/index.ts` as the single re-export point.** Existing
  command files importing `discoverProjectConfig`, `loadProjectConfigByName`,
  `parseProjectConfig`, `projectConfigSchema`, or `ProjectConfig` from
  `'../lib/index.js'` need no changes. Only `run.ts` (which imported from the
  deeper `../lib/config/index.js`) gets a path update.

## Plan reference

Task 1 of `docs/superpowers/plans/2026-04-28-daemon-bootstrap-and-projects-endpoint.md`
(plan doc not yet checked in; acceptance criteria are inlined in the Jira
ticket and faithfully implemented here).

## Verification

- `npm run lint` — pass at workspace root.
- `npm run typecheck` — pass for cli and shared workspaces.
- `npm run test:run` — pass; new `loader.test.ts` lives in `crew-shared`,
  CLI tests untouched.
- `npm run format:check` — pass.
