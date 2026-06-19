# CREW-263 — Ensure `~/.crew/state-events` is host-owned before the daemon mounts it

Jira: https://safturento.atlassian.net/browse/CREW-263

Sibling of the Concrete State Triggers work (CREW-254/255/256/262). Root cause
behind CREW-262's `finished` symptom: even with the hook loading, **zero**
`state_transitions` were written because the host couldn't write the JSONL log.

## Goal

`~/.crew/state-events` exists and is **user-writable** before docker compose
mounts it (or before dispatch appends to it), so the CLI emitters and the
`pr_created` hook actually write events. When the dir is `nobody`-owned, the
operator gets a clear chown remediation instead of a silent no-op.

## Root cause

`docker-compose.yml` mounts `${HOME}/.crew/state-events:/root/.crew/state-events:ro`.
When the host dir doesn't exist at `docker compose up`, **Docker creates it owned
by `nobody`**. Host-side writers (`emitStateEvent*`, the `pr_created` hook) then
hit EACCES on `appendFile`, swallowed best-effort → nothing written → the badge
falls back to `AgentsService.deriveState` heuristics. Identical footgun to the
runner-log dir, which already has the `ensureRunnerLogDir` remediation.

## Fix

Mirror `ensureRunnerLogDir` (`runner/paths.ts`) for the state-events dir:

- `ensureStateEventsDir(opts, deps)` in `lib/state-events/writer.ts` — creates
  `~/.crew/state-events` host-side and reports `{ dir, writable }`.
- `stateEventsChownRemediation(dir)` — the shared remediation string.
- `crew up` pre-creates the dir before `docker compose up` (alongside the runner
  dir) and warns with the chown remediation when it isn't writable.
- Emitters route their catch through `emitFailureLine`, which appends the chown
  remediation on EACCES/EPERM so a perms regression is loud, not silent.

## Relevant files

- `packages/cli/src/lib/state-events/writer.ts` — `ensureStateEventsDir`, `stateEventsChownRemediation`, `emitFailureLine`; both emitters route failures through `emitFailureLine`.
- `packages/cli/src/commands/up.ts` — new `ensureStateEventsDir` dep, pre-creates the dir before compose, warns on non-writable.
- `packages/cli/src/lib/state-events/writer.test.ts` — covers the ensure/writability + remediation paths.
- `packages/cli/src/commands/up.test.ts` — asserts the dir is pre-created before compose mounts it.

## Notes

Plain `docker compose up` (not `crew up`) can't be hooked, but in that path the
first dispatch emit now surfaces the chown remediation instead of failing
silently — matching the runner-log behavior.
