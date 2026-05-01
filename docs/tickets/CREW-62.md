# CREW-62 — Wire crew fix-pr stack bringup parity + shared `prepareAgentEnvironment` helper

Jira: https://safturento.atlassian.net/browse/CREW-62

## Goal

`crew run` and `crew fix-pr` share a single `prepareAgentEnvironment` helper that
owns pre-spawn orchestration (docker bringup + chromium install + URL resolution).
A new `ensureStackRunning` primitive provides the foreground/idempotent docker
bringup `fix-pr` needs in resume mode — fixing the gap where `fix-pr` assumed the
stack was already up.

## Relevant files

- `packages/cli/src/commands/run.ts` — fresh-mode caller; today inlines bringup +
  chromium install (lines 157–200).
- `packages/cli/src/commands/fix-pr.ts` — resume-mode caller; today inlines
  chromium install only (lines ~263–279), missing docker bringup entirely.
- `packages/cli/src/lib/docker/` — destination for `ensureStackRunning`. Already
  exports `port-hash`, `compose`, `env`.
- `packages/cli/src/lib/run/` — destination for `prepareAgentEnvironment`.
  Already houses `app-lifecycle.ts` (`agentNeedsAppRunning`) and `paths.ts`
  (`dockerLogPathFor`).
- `packages/cli/src/lib/playwright/install-browsers.ts` — referenced by the new
  helper for the chromium step.

## Decisions

- **`startDockerBringup` + `buildDockerBringupScript` move to
  `lib/docker/start-bringup.ts`** rather than staying in `run.ts`. The orchestrator
  needs to call them, and `run.ts` already imports the orchestrator — keeping
  the helpers in `run.ts` would require a circular import. The ticket explicitly
  leaves this to implementer's judgment.
- **`ensureStackRunning` returns `{ rc, logPath }` and never throws.** Mirrors
  `installPlaywrightBrowsers`. The orchestrator (`prepareAgentEnvironment`)
  decides what to do with non-zero rc — for `mode: 'resume'` it throws with the
  log path embedded in the message (matching the current chromium-failure shape
  in both commands).
- **Bruno-only path uses the same docker bringup gate.** `agentNeedsAppRunning`
  already returns true for bruno-only configs, so `prepareAgentEnvironment`
  picks them up automatically via the same gate as playwright.
- **`AgentEnvironmentResult.dockerProcess` is only present in fresh mode.** In
  resume mode bringup is blocking, so there's no handle to expose. Caller code
  in `crew run` keeps its existing 120s wait-then-detach loop.

## Out of scope (per ticket)

- New `crew resume <KEY>` command — separate follow-up.
- Better error UX when `crew run` is invoked against an existing worktree —
  bundled into the resume follow-up.

## Notes

The ticket's interface sketch types `dockerPorts?: DockerPorts` (singular,
optional) and `mode: 'fresh' | 'resume'`. Honoring those exactly so the future
`crew resume` ticket can drop in unchanged.
