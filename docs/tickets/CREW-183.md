# CREW-183 — npm install before installPlaywrightBrowsers

Jira: https://safturento.atlassian.net/browse/CREW-183

## Goal

Add `npm install` step in `prepareAgentEnvironment` before `installPlaywrightBrowsers` so bare worktrees can resolve project-pinned Playwright and actually fetch the Chromium binary. Without this, `npx playwright install chromium` silently no-ops and downstream `npm run test:e2e` fails with `Executable doesn't exist`.

## Relevant files

- `packages/cli/src/lib/run/install-node-modules.ts` (new) — mirrors `install-browsers.ts`: `{ worktree, key, env }` → `{ rc, logPath }`, spawns `npm install` and pipes output to `/tmp/crew-npm-install-<key>.log`.
- `packages/cli/src/lib/run/install-node-modules.test.ts` (new) — vitest, mocks `execa`, covers success / non-zero / cmd-args.
- `packages/cli/src/lib/run/paths.ts` — added `npmInstallLogPathFor(key)`.
- `packages/cli/src/lib/run/agent-environment.ts:80-99` — call `installNodeModules` before `installPlaywrightBrowsers`, throw on non-zero rc with log path embedded, mirror the existing pattern.
- `.agents/dispatch.md` — updated step 7 description + Logs table + `last_updated`.

## Decisions

- **Gate on `playwrightEnabled(config)`, same condition as the browser install.** Ticket scope: only fix the symptom that surfaces when Playwright is going to run. Don't make worktrees non-bare in general — that's a deliberate design (see `write-mcp-file.ts:73-79`).
- **`install-node-modules.ts` lives under `run/`, not `mcp-config/`.** Spec called this out explicitly. `install-browsers.ts` predates the convention — leave it where it is.

## Notes

- Surfaced on CREW-178 PR #255 — install log carries Playwright's own warning verbatim, that was the smoking gun.
- The dashboard `StateHistoryBar.test.tsx` failure observed under `npm run test:run` is pre-existing on `origin/main` (verified by stashing changes and re-running), unrelated to this ticket.
