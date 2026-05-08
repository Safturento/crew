# CREW-111 — dashboard e2e tests pass on worktree daemon

Jira: https://safturento.atlassian.net/browse/CREW-111

## Goal

Restore the 4 dashboard e2e tests (`packages/dashboard/tests/e2e/dashboard.spec.ts`) to green against a worktree daemon by closing three coupled gaps: producer-side `CREW_SEED_FIXTURES=1` injection, project-TOML fixture seeding, and a name-agnostic e2e selector rewrite.

## Open questions

- [ ] **Sandboxed agent shell can't reach `/var/run/docker.sock`.** During the 2026-05-07 review-feedback rerun, Step 0.5's `docker compose up --build --wait` failed with `permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`. The rebase itself succeeded (one `docs/followups.md` conflict resolved against main's parallel triage), and lint / typecheck / `npm run test:run` all pass. The agent shell is sandboxed; only `npm run bruno:smoke` and `npm run test:e2e` are whitelisted to run un-sandboxed against the docker stack. End-to-end e2e verification of this PR therefore still requires either (a) the human to run `docker compose up --force-recreate daemon` against the new `.env` (so the seeded `CREW_SEED_FIXTURES=1` reaches the container) and then run `npm run test:e2e`, or (b) a fresh `crew run`-style dispatch where the bringup wires the new env from the start.

## Notes

- All three fixes covered by unit tests: `materialize.test.ts` for the env injection, `seeds/dev.test.ts` + `serve.test.ts` for the project-TOML seeder + writable-configDir override, dashboard e2e uses shape assertions against the rendered DOM.
- The two subsumed followup entries (`#2026-05-05--worktree-env-injection-of-crew_seed_fixtures1-not-wired` and `#2026-05-05--dashboard-e2e-tests-expect-mock-client-project-names-that-dont-match-the-daemon-fixtures`) moved to Resolved with addendums on this branch; the rebase-resolution merged that with main's parallel `4af049c` triage commit (`Dashboard Dockerfile`, `Crew sandbox/preflight`, `@playwright/mcp`).
