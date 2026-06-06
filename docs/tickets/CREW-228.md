# CREW-228 — T5: crew doctor command

Jira: https://safturento.atlassian.net/browse/CREW-228
Parent Epic: [CREW-223](https://safturento.atlassian.net/browse/CREW-223) — crew init / crew doctor

## Goal

The `crew doctor` command: run the `lib/health` registry, render a grouped ✓/⚠/✗
report, `--fix` to apply the auto-fixable findings, `--all` to sweep every
configured project plus the machine checks. Non-interactive; exit 1 when
unhealthy (CI gate).

This is **Phase 4** of the plan (`docs/superpowers/plans/2026-06-05-crew-init-doctor.md`).

## Scope

- `lib/health/render.ts` — `renderReport(outcomes, { project })`: a grouped report
  with one glyphed line per finding, remediation indented beneath fails/warns, and a
  footer `N problems (M auto-fixable)`.
- `commands/doctor.ts` — a testable `runDoctor` core plus the thin `doctorCommand`
  with `--fix` / `--all` / `--yes`. Resolves the project via `discoverProjectConfig`;
  `--all` enumerates `~/.config/crew/projects/*.toml` via the loader.
- Register the command in `index.ts` (append — conflict point with T6/`init`).

## Relevant files

- `packages/cli/src/lib/health/registry.ts` — `checksFor('all' | 'project' | 'machine')`
- `packages/cli/src/lib/health/run-health.ts` — `runHealth` collect-all runner + `CheckOutcome`
- `packages/cli/src/lib/health/checks/chromium-installed.ts` — `createChromiumInstalledCheck({ confirm })`; doctor swaps the confirm to honor `--yes`
- `packages/cli/src/lib/discover-project-config.ts` — `discoverProjectConfig(cwd)`
- `packages/shared/src/config/loader.ts` — `defaultProjectConfigDir`, `parseProjectConfig`
- `packages/cli/src/lib/env-spec/index.ts` — `parseEnvFile` (read `.env` → `envVars`)

## Decisions

- **`runDoctor` core + thin command** — mirrors `env.ts`'s `runEnvInit` split so the
  exit-code / fix / enumeration logic is unit-testable with injected seams (`log`,
  `checks`, `discover`, `configDir`), and the commander `.action()` only marshals flags.
- **`fixed` counts gaps actually closed** — not `fix()` calls. After applying every
  fixable fail's `fix()`, re-detect and count checks that went `fail → not-fail`. This
  makes a confirm-declined chromium install (a no-op fix) correctly count as 0 fixed.
- **`--yes` wires the chromium confirm gate** — the registry's `chromium-installed` defaults
  to an interactive prompt (would hang under non-interactive `--fix`). Doctor rebuilds that
  one check via `createChromiumInstalledCheck({ confirm: async () => yes })` so `--fix`
  without `--yes` leaves the (large/network) install for the user, per spec §8 / CREW-227.
- **Machine checks run once** — under `--all`, project checks run per project but machine
  checks run a single time against a representative config (the first project that opts into
  Playwright, else the first project) so `chromium-installed` fires when any project needs it.
- **Read-only env materialization** — doctor parses an existing `.env` into `envVars` but never
  writes one; materialization stays `crew env init`'s job (surfaced by `env-materialized`).

## Notes

- Blocked-by T1 (registry core), T4 (CREW-227, remaining checks) — both merged into base.
- Shares `index.ts` with T6 (`init`) — build parallel, merge sequentially.
- Out of scope: `crew init` (T6) and any new checks.
