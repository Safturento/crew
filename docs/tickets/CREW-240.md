# CREW-240 — crew init + doctor: scaffold `.claude/secrets/gh-token` placeholder and gitignore it

Jira: https://safturento.atlassian.net/browse/CREW-240

## Goal

A fresh project fails to dispatch because `<repo>/.claude/secrets/gh-token` doesn't
exist — `crew init` never created it and never touched `.gitignore`. Done = `crew init`
scaffolds an empty `0600` placeholder + an idempotent `.claude/secrets/` gitignore
entry and tells the user to paste a real PAT, and a new `gh-token-present` health check
surfaces a missing/empty token under `crew doctor` (and the dispatch preflight gate).

## Relevant files

- `packages/cli/src/lib/init/scaffold-gh-token.ts` — NEW shared scaffolder (mirrors `scaffold-bruno.ts`); imported by both `run-init` and the check's `fix()`.
- `packages/cli/src/lib/init/run-init.ts` — wire the scaffolder in (step 8), surface the populate-PAT message.
- `packages/cli/src/lib/health/checks/gh-token-present.ts` — NEW `scope: 'project'` check.
- `packages/cli/src/lib/health/registry.ts` — register the check.
- `packages/cli/src/lib/run/preconditions.ts:7` — existing `requireGhToken` run-path gate (left unchanged; the new check mirrors its `!exists || size === 0` condition).
- `.agents/dispatch.md` — Preflight check table.

## Decisions

- **Empty placeholder, no run-path change.** The empty `0600` file still trips
  `requireGhToken` (`!exists || size === 0`), so no change to `preconditions.ts`.
- **`requireGhToken` stays a parallel fast gate, not delegating to the shared check.**
  It runs at `run.ts:248` *before* worktree creation with its own hard-throw error
  shape; the registry check is collect-all. Both mirror the identical
  `!exists || size === 0` condition, so they stay consistent. Keeping them parallel
  avoids threading the registry `HealthContext` into the pre-worktree gate.
- **Check uses the `worktree` context path.** Consistent with `bruno-skeleton` /
  `playwright-config`. In `crew doctor`, `buildContext` sets `worktree = config.repo_path`,
  so doctor inspects the repo; during dispatch preflight the token has already been
  copied into the worktree (`run.ts:316-320`), so the gate doesn't double-fail.
- **`fix()` is "limited".** It scaffolds path/perms/gitignore but the check stays `fail`
  until a real token is pasted — `fix()` can't supply a secret. Documented in the check.

## Notes

Secret-safe: the scaffolder never writes a real token, never reads an existing token's
contents (only `existsSync` + `statSync().size`), and never echoes contents. The
placeholder is empty by design.
