# CREW-308 — Runner rework B: CLI early-gate visibility

Jira: https://safturento.atlassian.net/browse/CREW-308

Implements Tasks 5–7 of `docs/superpowers/plans/2026-06-30-runner-page-rework.md` (spec: `docs/superpowers/specs/2026-06-30-runner-page-rework-design.md`). The plan/spec live on the unmerged `docs/runner-page-rework-spec` branch; content mirrored where needed. Depends on A (CREW-307, merged as the branch's HEAD).

## Goal

Make every `crew run` visible from the earliest attributable moment, and make preflight-gate deaths visible instead of silent:

1. **Task 5** — `crew run` posts `reportInitializing` right after `discoverProjectConfig` resolves, before the tool/gh-auth/worktree gate.
2. **Task 6** — an early preflight-gate failure (missing tool, gh-auth, worktree-exists) reports an `error` transition through the daemon (`POST /api/runner/early-failure` → `RunFailureService.recordEarlyFailure` → `reportEarlyFailure` client) before exiting, so the whole class becomes a visible `error` row.
3. **Task 7** — the runner heartbeat enriches its reap log line with the startup-log reason: `reaped 1 dead process(es): HAI-12 — startup failed: worktree already exists`.

## Relevant files

- `packages/cli/src/commands/run.ts` — hoist `daemonClient` + `worktree`; birth-before-gate; route gate failures through the daemon.
- `packages/cli/src/lib/daemon-client/index.ts` — `reportEarlyFailure` client.
- `packages/daemon/src/services/RunFailureService.ts` — `recordEarlyFailure`.
- `packages/daemon/src/routes/runner.ts` — `POST /api/runner/early-failure`.
- `bruno/endpoints/runner/post-early-failure.bru` — endpoint parity.
- `packages/cli/src/lib/runner/reap-reason.ts` (new) — read the startup jsonl tail for the last failed phase's summary.
- `packages/cli/src/lib/runner/loop.ts` — enrich the reap line via `reapReason`.

## Decisions

- **`!config` stays daemon-less.** The config-resolution failure has no `project_name` to key an agents row (NOT NULL) — the Epic explicitly accepts this pre-row gap. Only the three post-config gates (tools / gh-auth / worktree) report through the daemon; the `!config` path keeps the sync `failStartupPhase` (which retains TS control-flow narrowing of the nullable config).
- **Early-failure body carries project/worktree/branch**, not the plan's minimal `{key, phase, summary}`. The CLI has all of them at gate time, and it makes `recordEarlyFailure`'s upsert fallback real (the birth call could have been lost to a downed daemon). Mirrors `reportInitializing`'s body.
- **The transition carries the state; the reason lives in the startup log.** `recordEarlyFailure` writes only an `error` state-transition (`source: 'startup-failure'`); the operator-facing reason is already on the `~/.crew/startup/<key>.jsonl` `failed` phase (written sync by `emitStartupEventSync` before exit), which Inspect/reap-reason read.
- **`reapReason` reads the startup `.jsonl`, not the `.log`** — the structured `failed` phase carries a clean `summary`; the raw console log does not.
- **`reapReason` is injected into `runLoop`** (optional dep, defaults to the real fs-reading impl) so the loop test exercises the enrichment without touching disk.

## Scope boundary

Tasks 8–12 (safe orphan-worktree reclaim + Restart, reconcile roll-up, dashboard grid/states, retire Runner page) are later tickets (C/D/E/F). Backend + runner only — no dashboard/Figma changes, so no visual-fidelity gate.

## Notes

`reportInitializing` / `recordInitializing` / the initializing route + Bruno all shipped in A; Task 5 is pure `run.ts` wiring over them.
