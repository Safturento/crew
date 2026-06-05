# CREW-226 — T3: Migrate dispatch preflight gate onto `lib/health`

Jira: https://safturento.atlassian.net/browse/CREW-226

Part of Epic [CREW-223](https://safturento.atlassian.net/browse/CREW-223) (`crew init` / `crew doctor`).
Plan: `docs/superpowers/plans/2026-06-05-crew-init-doctor.md` → Phase 2.

## Goal

Absorb the two dispatch-critical preflight checks into `lib/health/checks/` and repoint the
`run`/`resume`/`fix-pr` gate at the registry, so "healthy" is defined once and consumed by both the
gate and (eventually) `crew doctor`. **Behaviour-preserving** — the existing preflight + dispatch
suites are the regression guard.

## Scope

- `lib/health/checks/excluded-commands.ts` (new) — absorbs `preflight/verify-excluded-commands.ts`;
  gains a `fix()` that array-merges the missing `excludedCommands` via the `lib/init`
  `writeSettingsJson` scaffolder (single source, from CREW-225).
- `lib/health/checks/app-url-resolves.ts` (new) — absorbs `preflight/probe-app-urls.ts`; keeps the
  network reachability probe (dispatch-critical) and adds a clean unresolved-`${VAR}` fail. No `fix()`.
- `lib/health/probe-url.ts` (moved from `preflight/`) — the HTTP probe util now lives with its only
  consumer, keeping the dependency direction `preflight → health` clean.
- `lib/health/types.ts` — `HealthContext` gains an optional `dockerPorts` (dispatch-only, mirrors the
  old `PreflightCheckContext`) so the app-url probe can resolve `{httpsPort}`-style templates.
- `lib/health/registry.ts` — `ALL` gains `excludedCommands` + `appUrlResolves`.
- `lib/preflight/run-preflight.ts` — rewritten as a thin fail-fast adapter over
  `runHealth(checksFor('project'), ctx)`: throw `PreflightError` on the first `fail`, ignore `warn`.
- `lib/preflight/run-resume-preflight.ts` — repointed at the new `excludedCommands` check.
- `lib/run/agent-environment.ts` — calls the new `runPreflight(ctx)` (no more `buildPreflightChecks`).
- Deleted (absorbed): `preflight/{verify-excluded-commands,probe-app-urls,build-checks}.ts` + tests.

## Acceptance

- New checks unit-tested; `run-preflight` throws `PreflightError` on the first project `fail` and
  ignores `warn`.
- The existing `lib/preflight` + `run`/`resume`/`fix-pr` suites stay green (no dispatch-behaviour
  change). `npm test --workspace=crew-cli` green.

## Decisions

- **App-url check keeps the network probe (behaviour-preserving), despite the "resolves" rename.**
  The plan's Task 2.2 wording leans toward template-resolution-only, but the ticket's hard acceptance
  criterion is "no dispatch-behaviour change" and spec §3 says *"each absorbed check keeps its current
  behaviour."* The dispatch gate's app-url check is the one that catches "docker stack failed to come
  up" — dropping the probe would be a real regression. So `app-url-resolves.detect()` resolves the
  template (clean `fail` + `env.toml` remediation when a `${VAR}` is unresolved — the plan's addition,
  and a fast network-free signal for `doctor`) **and then** probes the resolved URL (preserved). In
  real dispatch, ports/env are supplied so resolution always completes and the path is byte-identical
  to the old probe.
- **The gate now runs *all* project checks** (`config-valid`, `env-materialized`, `excluded-commands`,
  `app-url-resolves`), per spec §3. `config-valid` and `env-materialized` are benign no-ops in real
  dispatch (the config was already schema-loaded; env is materialized upstream), so dispatch outcomes
  are unchanged — but "healthy" is now defined in exactly one place.
- **No separate `active` gate on `excluded-commands`.** Applicability lives in `requiredEntries()`
  (empty ⇒ `ok`). For crew (bruno enabled) the entry set is identical to the old
  `buildPreflightChecks` path; the only divergence is a hypothetical docker-only project, for which
  the new check (correctly) verifies `docker compose*` — no real project nor existing test asserts the
  old narrower behaviour.
- **`fix()` reuses `lib/init/writeSettingsJson`** rather than re-implementing the merge — the
  scaffolder is the single write source (CREW-225 decision; resolves its "P2 owns consolidation"
  note). The gate adapter never calls `fix()`; auto-repair is `crew doctor --fix` (P4) only.
- **`probe-url.ts` moved into `lib/health/`** so `health` has no back-edge into `preflight`.

## Relevant files

- `packages/cli/src/lib/health/` — checks, registry, runner, types (the new home).
- `packages/cli/src/lib/preflight/` — `run-preflight` (adapter), `run-resume-preflight`,
  `render-error`, `types` (`PreflightError`).
- `packages/cli/src/lib/run/agent-environment.ts` — the fresh-mode dispatch caller.
- `packages/cli/src/lib/init/write-settings-json.ts` — the merge-write `fix()` delegates to.

## Notes

Out of scope: the remaining checks (P3), `crew doctor` (P4), `crew init` (P5). `registry.ts` is a
merge conflict point shared with T4 — merge sequentially + rebase.
