# CREW-22 — Set up @playwright/test in dashboard package for crew-authored tests

Jira: https://safturento.atlassian.net/browse/CREW-22

## Goal

Wire `@playwright/test` into `packages/dashboard/` so crew agents can author
Playwright `*.spec.ts` files against the dashboard. After this lands, the
project config can opt into `[visual_testing.authored]` and the authored
prompt fragment from [CREW-21](https://safturento.atlassian.net/browse/CREW-21)
becomes useful in this repo. Independent of the visual-testing epic
([CREW-18](https://safturento.atlassian.net/browse/CREW-18)).

## Relevant files

- `packages/dashboard/package.json` — add `@playwright/test` devDep and
  `test:e2e` script.
- `packages/dashboard/playwright.config.ts` — new. `webServer` runs
  `npm run dev` and points Playwright at `http://localhost:5173`.
- `packages/dashboard/tests/e2e/dashboard.spec.ts` — starter spec exercising
  the real `MockDaemonClient`-backed app: top nav, project sections, toggle.
- `packages/dashboard/vitest.config.ts` — add `tests/e2e/**` to `exclude` so
  `npm run test:run` doesn't try to run Playwright specs through Vitest.
- `eslint.config.js` — extend the test override (`no-non-null-assertion: off`)
  to also cover `**/*.spec.ts(x)` so future Playwright specs lint cleanly.
- `.gitignore` — ignore Playwright's local artifacts (`test-results/`,
  `playwright-report/`, `.playwright/`).

## Decisions

- **Single `chromium` project for the starter.** Multi-browser matrices add
  setup time and flakes without adding signal for an MCP-driven authored
  test. Easy to expand later.
- **`webServer.reuseExistingServer = !process.env.CI`.** Local devs already
  running `npm run dev` shouldn't have Playwright fight them for the port.
  CI starts its own.
- **Stable user flows only.** Starter test asserts on app shell (brand,
  Agents tab, project section toggle aria-label). Avoids fixture-data
  coupling that would churn when `FIXTURE_AGENTS` evolves.
- **`tests/e2e/` lives at the package root, not under `src/`.** Keeps
  Playwright's filesystem isolation explicit and matches the path the
  ticket's example config (`tests_dir = "packages/dashboard/tests/e2e"`)
  already references.

## Out of scope

- CI integration. No GitHub Actions workflow exists yet for this repo;
  adding one is a separate ticket.
- Per-worktree port hashing for the dashboard's Vite server. Flagged in the
  ticket — sequential `crew run` is fine for now.

## Notes

`packages/dashboard/tsconfig.json` already scopes `include` to `src/**/*`,
so the new `tests/e2e/` directory is naturally outside the typecheck pass.
Playwright's runner does its own TS compilation.
