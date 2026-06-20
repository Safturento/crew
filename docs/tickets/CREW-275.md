# CREW-275 — Dashboard Resume button dispatches `crew run` instead of `crew resume`

Jira: https://safturento.atlassian.net/browse/CREW-275

## Goal

Clicking **Resume** on an idle agent whose worktree still exists (an
interrupted / incomplete run) continues the run via `crew resume <key>` instead
of `crew run <key>` — which bounces off `crew run`'s "worktree already exists"
preflight. Requires a new `resume` **action kind** end-to-end:
shared → daemon enqueue (+ DB CHECK) → host runner executor → `crew resume`.

## Relevant files

- `packages/shared/src/actions/types.ts` — `ACTION_KINDS` tuple + `ActionPayload` union
- `packages/shared/src/actions/schema.ts` — `enqueueActionSchema` discriminated union
- `packages/shared/src/runner/types.ts` / `schema.ts` — `LiveProcess.command` union (the executor stamps `resume` into the registry)
- `packages/daemon/src/migrations/0013_action_resume_kind.ts` — widens the `kind` CHECK constraint (SQLite table-recreate)
- `packages/daemon/src/routes/actions.ts` — `ActionPayloadSchema` response union
- `packages/cli/src/lib/runner/executor.ts` — `case 'resume'` → `crew resume <key>`
- `packages/dashboard/src/App.tsx` — `onAgentAction` maps `resume` → `{ kind: 'resume' }`
- `packages/dashboard/src/data/actions.ts` — `ACTION_LABELS` record (must cover the new kind)

## Decisions

- **`resume` carries no payload** — like `run`/`finish`, it's just the request
  envelope. `toPayload` in `ActionService` already returns `{ kind }` for the
  non-`fix_pr` case, so no service change is needed.
- **New migration `0013`, not an edit to `0006`** — never edit a shipped
  migration. Mirrors the `0005` table-recreate pattern (SQLite can't ALTER a
  CHECK constraint).
- **`LiveProcess.command` gains `resume`** — `toCommand('resume')` passes
  through to `'resume'`, and the registry/snapshot schema must accept it.

## Relationship

Distinct from the pause/resume *live-process* work (CREW-273/274), which
resumes a **paused running process** via `runner_commands`. This resumes an
**idle / interrupted run** via the **action queue** + `crew resume`.

## Notes

`crew resume`'s preflight uses `mode: 'resume'`, which tolerates the existing
worktree (`packages/cli/src/commands/resume.ts`).
