# CREW-224 — Health-check registry core (`lib/health/`)

Jira: https://safturento.atlassian.net/browse/CREW-224

Epic: [CREW-223](https://safturento.atlassian.net/browse/CREW-223) — crew init / crew doctor onboarding + health commands.
Plan: `docs/superpowers/plans/2026-06-05-crew-init-doctor.md` (Phase 1, Tasks 1.1–1.3).

## Goal

Introduce the `packages/cli/src/lib/health/` foundation: the `HealthCheck`
abstraction, a collect-all runner, and the check registry, seeded with two
project-scoped checks. This is the substrate later consumed by `crew doctor`
(CREW-228), `crew init`'s converge validation (CREW-229), and the dispatch-gate
migration (CREW-226). Scope is Phase 1 only — the preflight gate is **not**
touched here.

## Relevant files

- `packages/cli/src/lib/health/types.ts` — `CheckStatus`, `CheckResult`, `HealthContext`, `HealthCheck` + `ok()`/`warn()`/`fail()` builders.
- `packages/cli/src/lib/health/run-health.ts` — `runHealth(checks, ctx)`: runs all checks, collects `{ check, result }[]`, turns a throwing `detect()` into a `fail` result (never throws).
- `packages/cli/src/lib/health/registry.ts` — `checksFor(scope)` applicability filter over the `ALL` inventory.
- `packages/cli/src/lib/health/checks/config-valid.ts` — re-parses `ctx.config` via the shared `projectConfigSchema` (schema-agnostic); no `fix()`.
- `packages/cli/src/lib/health/checks/env-materialized.ts` — verifies `env.toml` → `.env` is materialized; `fix()` delegates to the existing `runEnvInit`.
- `packages/cli/src/commands/env.ts` — `runEnvInit`, reused by `env-materialized`'s `fix()`.
- `packages/cli/src/lib/preflight/types.ts` — the `PreflightCheck` this generalizes (migration is CREW-226).

## Decisions

- **`detect`/`fix` split, not `run`** — generalizes the preflight `PreflightCheck.run` into a richer result-returning `detect()` plus an optional `fix()`, so the same registry serves diagnostics (doctor), repair (`--fix`), and the fail-fast gate.
- **Collect-all base, fail-fast on top** — `runHealth` never short-circuits; the dispatch gate's fail-fast semantics are layered over it in CREW-226. A throwing `detect()` becomes a `fail` result so one broken check can't hide the rest.
- **`config-valid` is schema-agnostic** — it delegates entirely to `projectConfigSchema.safeParse`, so it tracks schema changes for free; no `fix()` because re-authoring config is `crew init`'s job.
- **`env-materialized` reuses `runEnvInit`** — the check's `fix()` calls the existing command function rather than duplicating materialization. A project with no `env.toml` is healthy (nothing to do).
- **Both seed checks are `project`-scoped** — `machine`-scoped checks arrive in CREW-227; `checksFor('machine')` is legitimately empty in this phase.

## Notes

- Backend-only CLI change: no HTTP routes, no UI, not yet registered in `src/index.ts`. Bruno / e2e / visual-fidelity gates don't apply.
- Verified: `npm run lint`, `npm run typecheck` (all workspaces), and the full `crew-cli` Vitest suite green (784 pass). Daemon `test:run` has two pre-existing environmental failures (read-only `~/.crew/startup` mount) unrelated to this diff.
